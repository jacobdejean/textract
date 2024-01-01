#!/usr/bin/env bun

import { JSONParser } from "@streamparser/json";
import yeast from "yeast";
import { $, cd, os } from "zx";
import meow from "meow";
import fs from "fs";

const cli = meow(
  `
	Usage
	  $ textract <input>

	Options
	  --output, -o Output file

	Examples
	  $ textract ./recording.mp4
    $ textract ./recording.mp4 -o ./transcript.txt
`,
  {
    importMeta: import.meta,
    flags: {
      output: {
        type: "string",
        shortFlag: "o",
      },
    },
  }
);

const jsonparser = new JSONParser();

$.verbose = false;

type Flags = typeof cli.flags;

async function main(source: string, flags: Flags) {
  console.time("textract");

  const sourceFile = Bun.file(source);
  const sourceExists = await sourceFile.exists();
  if (!sourceExists) {
    console.log();
  }

  // save to temp so we can cache (nyi)
  const tempDir = `${os.tmpdir()}/${"textract"}`;
  const tempFile = `${tempDir}/${yeast()}.wav`;
  const tempLog = `${tempFile}.log`;

  await ensureTempDirExists(tempDir);

  console.log("Extracting audio");

  // Extract wave from video
  await $`ffmpeg -hide_banner -loglevel error -i ${source} -vn -ar 16000 -ac 1 -c:a pcm_s16le ${tempFile}`.pipe(
    fs.createWriteStream(tempLog)
  );

  console.log("Transcribing audio");

  // transcribe wave file
  cd("./lib/whisper.cpp/");
  await $`./main -f ${tempFile} --output-json-full`.pipe(
    fs.createWriteStream(tempLog)
  );

  console.log("Parsing transcript");

  // process json transcript
  const transcriptPath = `${"/Users/jacobdejean/Desktop/Op10iTq.wav"}.json`;
  const transcriptFile = Bun.file(transcriptPath);
  const transcriptStream = transcriptFile.stream();
  const transcriptReader = transcriptStream.getReader();

  jsonparser.onValue = ({ value, key, parent, stack, partial }) => {
    switch (key) {
      case "transcription":
        const items = Array.isArray(value) ? value : null;
        if (!items) {
          return;
        }
        items.forEach((item, index) => {
          const { offsets, text, timestamps, tokens } = item;
          console.log(text);
        });
        break;
      default:
        return;
    }
  };

  // @ts-ignore This is fine as long as writeValues doesn't use readMany
  writeValues(jsonparser, transcriptReader, 1);

  console.timeEnd("textract");
}

async function ensureTempDirExists(path: string) {
  await $`
    if [ ! -d "${path}" ]; then
      mkdir ${path}
    fi
  `;
}

async function writeValues(
  parser: JSONParser,
  reader: ReadableStreamDefaultReader<any>,
  limit?: number
) {
  const limitCount = limit || Infinity;
  let count = 0;
  while (count < limitCount) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parser.write(value);
    count++;
  }
}

main(cli.input.at(0) ?? "empty", cli.flags);

import test from "node:test";
import assert from "node:assert/strict";
import { droppedFiles, filesFromEntry } from "../src/file-drop.js";

test("拖入目录时会读取全部批次并递归收集文件", async () => {
  const first = { name: "first.pdf" };
  const second = { name: "second.pdf" };
  const fileEntry = (file) => ({ isFile: true, file(resolve) { resolve(file); } });
  const batches = [[fileEntry(first)], [fileEntry(second)], []];
  const directory = {
    isDirectory: true,
    createReader() {
      return { readEntries(resolve) { resolve(batches.shift()); } };
    },
  };
  assert.deepEqual(await filesFromEntry(directory), [first, second]);
});

test("目录读取失败时不会卡住，并回退到浏览器提供的文件列表", async () => {
  const fallback = { name: "fallback.pdf" };
  const brokenDirectory = {
    isDirectory: true,
    createReader() {
      return { readEntries(_resolve, reject) { reject(new Error("denied")); } };
    },
  };
  const result = await droppedFiles({
    files: [fallback],
    items: [{ webkitGetAsEntry() { return brokenDirectory; } }],
  });
  assert.deepEqual(result, [fallback]);
});

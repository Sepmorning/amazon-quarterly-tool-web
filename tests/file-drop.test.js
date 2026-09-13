import test from "node:test";
import assert from "node:assert/strict";
import { droppedFiles, filesFromEntry, filesFromHandle } from "../src/file-drop.js";

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

test("新版浏览器拖入文件夹时使用目录句柄递归收集文件", async () => {
  const first = { name: "first.pdf" };
  const second = { name: "second.pdf" };
  const directory = {
    kind: "directory",
    async *values() {
      yield { kind: "file", async getFile() { return first; } };
      yield {
        kind: "directory",
        async *values() {
          yield { kind: "file", async getFile() { return second; } };
        },
      };
    },
  };
  assert.deepEqual(await filesFromHandle(directory), [first, second]);
  assert.deepEqual(await droppedFiles({
    files: [],
    items: [{ kind: "file", async getAsFileSystemHandle() { return directory; } }],
  }), [first, second]);
});

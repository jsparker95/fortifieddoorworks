import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PROJECT_FILE_BYTES, projectFileSizeError, storageUploadEndpoint } from "../lib/project-file-upload";

test("project upload and extraction accept the 296 MB drawing set, up to 500 MiB",()=>{
  assert.equal(projectFileSizeError(310104758),null);
  assert.equal(projectFileSizeError(MAX_PROJECT_FILE_BYTES),null);
  assert.match(projectFileSizeError(MAX_PROJECT_FILE_BYTES+1)!,/500 MB/);
});

test("large uploads use the direct storage host while local and custom URLs remain usable",()=>{
  assert.equal(storageUploadEndpoint("https://example.supabase.co"),"https://example.storage.supabase.co/storage/v1/upload/resumable");
  assert.equal(storageUploadEndpoint("https://example.storage.supabase.co"),"https://example.storage.supabase.co/storage/v1/upload/resumable");
  assert.equal(storageUploadEndpoint("http://127.0.0.1:54321"),"http://127.0.0.1:54321/storage/v1/upload/resumable");
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { hasExplicitExtractionRequest } from "../lib/drawing-takeoff/start-request";

test("extraction requires an explicit boolean start request",()=>{
  for (const input of [null,undefined,{}, {documentId:"uploaded"},{startRequested:false},{startRequested:"true"}]) {
    assert.equal(hasExplicitExtractionRequest(input),false);
  }
  assert.equal(hasExplicitExtractionRequest({startRequested:true}),true);
});

test("upload path cannot call extraction and preview effects cannot call analyze",()=>{
  const upload=fs.readFileSync("components/project-files.tsx","utf8");
  assert.doesNotMatch(upload,/\/api\/documents\/analyze.*method:\s*["']POST/);
  assert.doesNotMatch(upload,/setSelectedDocument\(row/);
  const source=ts.createSourceFile("document-manager.tsx",fs.readFileSync("components/document-manager.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=(node:ts.Node)=>{
    if(ts.isCallExpression(node)&&node.expression.getText(source)==="useEffect") {
      assert.doesNotMatch(node.getText(source),/\banalyze\s*\(/,"Opening a preview must not trigger analysis");
      assert.doesNotMatch(node.getText(source),/\bonApply\s*\(/,"Opening a preview must not import saved candidates");
    }
    ts.forEachChild(node,visit);
  };
  visit(source);
});

import { SharedStringsXform } from "../modules/excel/xlsx/xform/strings/shared-strings-xform";

const filename = process.argv[2];

const st = new SharedStringsXform();

const lst = ["Hello", "Hello", "World", "Hello\nWorld!", "Hello, 'World!'"];
for (const item of lst) {
  st.add(item);
}

console.log(`Writing sharedstrings to ${filename}`);
console.log("Shared strings:", st.values);
console.log("Done.");

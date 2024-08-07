/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * Build: <objdir>/dist/@types/lib.gecko.xpcom.d.ts,
 *
 * from:  <objdir>/config/makefiles/xpidl/*.d.json type definition files,
 *        generated by a previous build step.
 */

const fs = require("fs");
const URL = "https://searchfox.org/mozilla-central/source/";

const HEADER = `/**
 * NOTE: Do not modify this file by hand.
 * Content was generated from source XPCOM .idl files.
 * If you're updating some of the sources, see README for instructions.
 */
`;

// Emit a typescript interface, along with any related enums.
function ts_interface(iface) {
  let lines = [];
  let base = iface.base;
  iface.class = iface.id;

  // Make QueryInterface optional, enable plain objects to pass as nsISupports.
  let partial = iface.id === "nsISupports" ? "?" : "";

  let enums = iface.enums.map(e => `typeof ${iface.id}.${e.id}`).join(" & ");
  if (enums) {
    base += `, Enums<${enums}>`;
    iface.class += `, ${enums}`;

    // Close the global scope, avoid polluting it with the namespace value.
    lines.push("}  // global\n");
    lines.push(`declare namespace ${iface.id} {\n`);

    for (let e of iface.enums) {
      lines.push(`enum ${e.id} {`);
      for (let v of e.variants) {
        lines.push(`  ${v.name} = ${v.value},`);
      }
      lines.push("}\n");
    }

    lines.push("}\n");
    lines.push("declare global {\n");
  }

  // Handle [function] interfaces.
  if (iface.callable) {
    lines.push(`type ${iface.id} = Callable<{`);
  } else {
    lines.push(`interface ${iface.id} ${base ? `extends ${base} ` : ""}{`);
  }

  for (let c of iface.consts) {
    lines.push(`  readonly ${c.name}: ${c.value};`);
  }

  if (iface.consts.length && iface.members.length) {
    // For style points.
    lines.push("");
  }

  for (let m of iface.members) {
    if (!m.args) {
      lines.push(`  ${m.readonly ? "readonly " : ""}${m.name}: ${m.type};`);
    } else {
      let args = [];
      for (let arg of m.args) {
        // If this is the generic parameter, adjust its type.
        let type = arg.name === m.iid_is ? "T" : arg.type;
        args.push(`${arg.name}${arg.optional ? "?" : ""}: ${type}`);
      }
      let type = `(${args.join(", ")}): ${m.type}`;
      // Adjust signature if this is a generic method.
      let signature = m.iid_is ? `<T extends nsIID>${type}<T>` : type;
      lines.push(`  ${m.name}${partial}${signature};`);
    }
  }

  lines.push(iface.callable ? "}>\n" : "}\n");
  return lines;
}

// Link all generated .d.json files into a self-contained ts typelib.
function ts_link(dir, files) {
  let lines = [HEADER, "declare global {\n"];
  let typedefs = {};
  let iids = [];

  for (let djson of files) {
    let modules = JSON.parse(fs.readFileSync(`${dir}/${djson}`, "utf8"));

    for (let mod of modules) {
      lines.push(`// ${URL}${mod.path}\n`);
      Object.assign(typedefs, Object.fromEntries(mod.typedefs ?? []));

      for (let iface of mod.interfaces ?? []) {
        if (iface.id !== "nsIXPCComponents_Interfaces") {
          lines = lines.concat(ts_interface(iface));
          iids.push(`  ${iface.id}: nsJSIID<${iface.class}>;`);
        }
      }
    }
  }

  lines.push("interface nsIXPCComponents_Interfaces {");
  lines = lines.concat(iids);
  lines.push("}\n");

  lines.push("}  // global\n");

  lines.push("// Typedefs from xpidl.");
  for (let [id, type] of Object.entries(typedefs).sort()) {
    lines.push(`type ${id} = ${type};`);
  }
  lines.push("");

  // Include xpcom builtins.
  lines.push(fs.readFileSync(`${__dirname}/config/intrinsics.d.ts`, "utf8"));
  return lines;
}

// For testing.
module.exports = { ts_link };

function main(lib_dts, djson_dir, ...djson_files) {
  let dts = ts_link(djson_dir, djson_files).join("\n");
  console.log(`[INFO] ${lib_dts} (${dts.length.toLocaleString()} bytes)`);
  fs.writeFileSync(lib_dts, dts);
}

if (require.main === module) {
  main(...process.argv.slice(2));
}

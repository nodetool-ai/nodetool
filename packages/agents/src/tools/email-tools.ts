/**
 * Email tools for Gmail IMAP operations.
 *
 * @deprecated Ported to the `email` capability module
 * (`../capabilities/email.ts`). These survive as thin subclasses so existing
 * constructors keep working; there is one implementation behind both.
 */

import { CapabilityTool, ungatedCapabilityRun } from "../capabilities/index.js";
import {
  addLabelToEmail,
  archiveEmail,
  searchEmail
} from "../capabilities/email.js";

/**
 * @deprecated Ported to the `email` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class SearchEmailTool extends CapabilityTool {
  constructor() {
    super(searchEmail.spec, searchEmail.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `email` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class ArchiveEmailTool extends CapabilityTool {
  constructor() {
    super(archiveEmail.spec, archiveEmail.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `email` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class AddLabelToEmailTool extends CapabilityTool {
  constructor() {
    super(addLabelToEmail.spec, addLabelToEmail.impl, ungatedCapabilityRun);
  }
}

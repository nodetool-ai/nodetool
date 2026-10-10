/**
 * Journey: write in a new text file.
 *
 * Fast typing in the text editor used to lose letters ("Hello, this is my
 * test note." became "Hlo,ti smyetnt."): every render pushed a slightly older
 * copy of the text back into Monaco. A person typing quickly on a busy page
 * sees the same thing, so this asserts on the text that actually shows.
 */

import { test, expect } from "./fixtures";
import { TextFilePage } from "./pages";

const NOTE = "Hello, this is my test note.";

test("keeps every letter typed quickly into a new text file", async ({
  page
}) => {
  const file = new TextFilePage(page);
  await file.create(/Plain text/);

  await file.typeFast(NOTE);

  await expect(file.lines()).toHaveText(NOTE);
});

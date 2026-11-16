// Rule 3: Projects (+name) and contexts (@name) may appear anywhere in the
// text after the priority and prepended date.
import { heading, show } from "./show.ts";

heading("Multiple projects and contexts");
show("(A) Call Mom +Family +PeaceLoveAndHappiness @iphone @phone");

heading("A name runs until the next whitespace");
show("Call +driftradio @phone");
show("Call +driftradio.net @email-work");
show("Call +drift-radio");
show("Call +drift radio");
show("Call @email work");

heading("A tag can appear at the very start of the text");
show("@GroceryStore pies");

heading("Email addresses, arithmetic, and bare markers are not tags");
show("Email SoAndSo at soandso@example.com");
show("Learn how to add 2+2");
show("Compare + and @ symbols");

heading("Punctuation and duplicates are preserved");
show("Call Mom +Family, @phone.");
show("Call Mom +Family +Family @phone @phone");

heading("Tags are recognized before key:value metadata");
show("Call Mom @foo:bar +baz:qux");

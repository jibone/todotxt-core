// Rule 1: If priority exists, it ALWAYS appears first.
// A priority is an uppercase A-Z in parentheses followed by a space.
import { heading, show } from "./show.ts";

heading("A priority at the start of the line");
show("(A) Call Mom");

heading("No priority: the parenthesized letter is not first");
show("Really gotta call Mom (A) @phone @someday");

heading("No priority: lowercase or missing space");
show("(b) Get back to the boss");
show("(B)->Submit TPS report");

heading("Only the first priority is used");
show("(A) (B) Call Mom");

heading("No priority after leading whitespace");
show(" (A) Call Mom");

heading("Completed tasks do not parse a priority");
show("x (A) 2011-03-03 Call Mom");

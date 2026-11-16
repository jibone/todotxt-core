// Rule 2: A creation date may appear directly after the priority.
// Without a priority, the creation date appears first.
import { heading, show } from "./show.ts";

heading("Creation date without a priority");
show("2011-03-02 Document +TodoTxt task format");

heading("Creation date after a priority");
show("(A) 2011-03-02 Call Mom");

heading("Not a creation date: not at the front");
show("(A) Call Mom 2011-03-02");

heading("Not a creation date: wrong shape");
show("2011-3-2 Document the format");

heading("Calendar validation");
show("2012-02-29 Leap day");
show("2011-02-29 Not a leap year");
show("2011-02-30 Impossible day");
show("2011-99-99 Impossible month");

heading("An invalid date stays in the description and emits a warning");
show("(A) 2011-99-99 Call Mom");

heading("A date-only line is allowed");
show("(A) 2011-03-02");

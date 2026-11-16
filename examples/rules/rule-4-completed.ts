// Rule 4: A completed task starts with a lowercase x and a space.
// The completion date follows the x; the creation date follows that.
import { heading, show } from "./show.ts";

heading("Completed task with a completion date");
show("x 2011-03-03 Call Mom");

heading("Completion date, then creation date");
show("x 2011-03-02 2011-03-01 Review Tim's pull request +TodoTxtTouch @github");

heading("This parser allows a completed task without a completion date");
show("x Call Mom");

heading("Not completed");
show("xylophone lesson");
show("X 2012-01-01 Make resolutions");
show("(A) x Find ticket prices");
show("x\tCall Mom");

heading("Priority after x is text; use pri: metadata instead");
show("x (A) 2011-03-03 Call Mom");
show("x 2011-03-02 2011-03-01 Task pri:A");

heading("An invalid completion date stays in the description");
show("x 2011-99-99 Call Mom");

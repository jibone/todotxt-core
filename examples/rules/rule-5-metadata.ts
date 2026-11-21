// Rule 5: Extra metadata is key:value.
// The first colon separates a non-empty, colon-free key from a value with no
// whitespace. The value may be empty and may contain further colons.
import { heading, show } from "./show.ts";

heading("key:value metadata");
show("Pay rent due:2010-01-02 rec:1w");

heading("The first colon separates the key and value");
show("Call Mom a:b:c");
show("Call Mom TODO:2011-03-02T10:00");

heading("A URL can be stored as a metadata value");
show("Sign up url:https://example.com");

heading("The key must be non-empty; the value may be empty");
show("Call Mom due:");
show("Call Mom key: value");
show("Call Mom :value");

heading("Duplicate keys: the last value wins, with a warning");
show("Task due:2010-01-02 due:2010-02-02");

heading("A bare URL is still metadata, per the format");
show("Call Mom http://example.com");

heading("Metadata values are opaque; dates are not validated here");
show("Task due:2011-99-99");

heading("A record can contain only metadata");
show("+Family @phone due:2011-03-05");

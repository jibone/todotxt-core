// Rule 5: Extra metadata is key:value.
// Key and value are non-whitespace, contain no colons, and are separated by
// exactly one colon.
import { heading, show } from "./show.ts";

heading("key:value metadata");
show("Pay rent due:2010-01-02 rec:1w");

heading("Exactly one colon separates the key and value");
show("Call Mom a:b:c");
show("Call Mom TODO:2011-03-02T10:00");

heading("Key and value must be non-empty");
show("Call Mom due:");
show("Call Mom :value");
show("Call Mom key: value");

heading("Duplicate keys: the last value wins, with a warning");
show("Task due:2010-01-02 due:2010-02-02");

heading("A single-colon token is metadata, even when it looks like a URL");
show("Call Mom http://example.com");

heading("Metadata values are opaque; dates are not validated here");
show("Task due:2011-99-99");

heading("A record can contain only metadata");
show("+Family @phone due:2011-03-05");

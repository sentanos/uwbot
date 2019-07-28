Files in the command folder can contain any number of commands. Right now they are grouped up 
into files by relevant functionality (they are not necessarily tied to modules and are not 
defined in module files).
- All exported classes MUST extend the `Command` class.
- Command names must be all lowercase (executing commands is case insensitive anyways).
- Files that end in `.tmpl.ts` will NOT be loaded as they are intended for templating commands.

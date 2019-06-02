Files in the command folder can contain any number of commands. Right now they are grouped up 
into files by relevant functionality (they are not necessarily tied to modules and are not 
defined in module files).
- All exported classes MUST extend the `Commands` class.
- Command names must be all lowercase (executing commands is case insensitive anyways).
- Command names should not start with the same thing. eg. there should not be both an ">xp" 
command and a ">xp something" command.
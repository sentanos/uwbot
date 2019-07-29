Modules are files that contain specific bot functions. They may contain a module class (loaded by
 the bot) as well as other classes and functions relevant to the module class.
- All modules are automatically loaded and constructed with the bot object as the only parameter.
- Modules are excluded from auto loading if they end with ".skip.ts".
- An initialize function can be defined to asynchronously load the module.
- Because files in the modules folder may contain more than just the module class itself, so the 
module classname must end with "Module".
- Modules often attach event handlers (directly to the client).
- Modules can be retrieved using `bot.getModule("moduleName")`. Although it is possible to 
retrieve a module from a different module, this should be done carefully because it must be 
completely certain that the other module has been loaded.
- Modules interact kind of weirdly with the type system. Special care must be given to making 
sure that retrieved modules are retrieved with the correct name and that they are being loaded 
because issues will not be evident until runtime.

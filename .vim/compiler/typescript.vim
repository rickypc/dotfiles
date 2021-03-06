if exists("current_compiler")
  finish
endif
let current_compiler = "typescript"

if !exists("g:typescript_compiler_binary")
  let g:typescript_compiler_binary = "tsc"
endif

if !exists("g:typescript_compiler_options")
  let g:typescript_compiler_options = ""
endif

if exists(":CompilerSet") != 2
  command! -nargs=* CompilerSet setlocal <args>
endif

let &l:makeprg = g:typescript_compiler_binary . ' ' . g:typescript_compiler_options . ' $*  %'

CompilerSet errorformat=%+A\ %#%f\ %#(%l\\\,%c):\ %m,%C%m

autocmd QuickFixCmdPost [^l]* nested cwindow
autocmd QuickFixCmdPost    l* nested lwindow

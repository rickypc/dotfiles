" Richard Huang's .vimrc
"
set nocompatible
set laststatus=2

set backspace=indent,eol,start

" set hidden
set noautoindent
set linebreak

" Highly recommended to set tab keys to 4 spaces
set expandtab
"set tabstop=4
set shiftwidth=4
set softtabstop=4

set textwidth=0
"set textwidth=78

set showmatch
set matchtime=3

set incsearch

"set term=xterm
"set t_Co=256
"let &t_AB="\e[48;5;%dm"
"let &t_AF="\e[38;5;%dm"

if &term =~ "xterm-xfree86"
    set t_Co=16
    set t_Sf=^[[3%dm
    set t_Sb=^[[4%dm
endif

" keep a copy of last edit - make sure the backup dir exists
set backup

if version >= 700
    set backupdir=~/.vim/backup/
    set statusline=%<%f%{GitBranchInfoString()}\%h%m%r%=%-20.(\ line=%l\ \ col=%c%V\ \ totlin=%L%)\ \ \%h%m%r%=%-40(bytval=0x%B,%n%Y%)\%P
    let NERDTreeIgnore=['\.vim$', '\~$', '\.pyc$', '\.svn$']
    map \ne :NERDTree<CR>
else
    let &rtp=substitute(&rtp, '\.vim', '&6', 'g')
    set backupdir=~/.vim6/backup/
    set statusline=%<%f\%h%m%r%=%-20.(\ line=%l\ \ col=%c%V\ \ totlin=%L%)\ \ \%h%m%r%=%-40(bytval=0x%B,%n%Y%)\%P
    map \cv :GITDiff<CR>
endif

syntax on
set hlsearch

if has("gui_running")
    if has("gui_gtk2")
      set guifont=Inconsolata\ 12
    elseif has("gui_macvim")
      set guifont=Menlo\ Regular:h14
    elseif has("gui_win32")
      set guifont=Consolas:h11:cANSI
    endif
endif

set background=dark
colorscheme zenburn

if has("autocmd")
    filetype plugin on
    " *.t files.
    au BufNewFile,BufRead *.t set filetype=perl
    " *.tt files.
    au BufNewFile,BufRead *.tt set filetype=tt2html
    " markdown files
    au BufNewFile,BufRead *.md set filetype=markdown
    " json files
    au! BufRead,BufNewFile *.json set filetype=json
endif

"au BufWinEnter * let w:m2=matchadd('ErrorMsg', '\%>80v.\+', -1)

set ignorecase
set smartcase
set number

set scrolloff=2

set encoding=utf-8

let g:git_branch_status_head_current=1
let g:git_branch_status_ignore_remotes=1
let g:git_branch_status_nogit=''
let g:git_branch_status_text=' '

map ,l :!perl -I "${PERL5LIB//:/ }" -cwT %<CR>

map ,w :mkview<CR>:w<CR>
map ,v :loadview<CR>

map ,fs /^sub <CR>V/{<CR>%zfj

map \jh :JSHint<CR>
map \ve :VSTreeExplore<CR>

vmap <F11> :-1/^#/s///<CR>
vmap <F12> :-1/^/s//#/<CR>

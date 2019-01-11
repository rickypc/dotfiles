" Richard Huang's .vimrc

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"                                 Vim Behavior
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

" I want vim - better safe than sorry
set nocompatible

" sane backspace
set backspace=indent,eol,start

set encoding=utf-8

" search
set hlsearch incsearch ignorecase smartcase

" don't unload buffer when switching away
" set hidden

" always show status bar
set laststatus=2

set matchtime=3 showmatch

" allow per-file settings via modeline
set modeline

" hide default mode text
set noshowmode

" show absolute line number of the current line
set number

" use letter as the print output format
set printoptions=paper:letter

" scroll the window so we can always see 2 lines around
set scrolloff=2

" disable unsafe commands in local .vimrc files
set secure

" no-wrap
set textwidth=0
"set textwidth=78

" auto save
autocmd BufLeave,CursorHold,CursorHoldI,FocusLost * silent! wa

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"                                  Appearance
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

syntax on
set background=dark
colorscheme zenburn

"set term=xterm
set t_Co=256
"let &t_AB="\e[48;5;%dm"
"let &t_AF="\e[38;5;%dm"

if &term =~ "xterm-xfree86"
    set t_Co=16
    set t_Sf=^[[3%dm
    set t_Sb=^[[4%dm
endif

if has("gui_running")
    if has("gui_gtk2")
      set guifont=Inconsolata\ 12
    elseif has("gui_macvim")
      set guifont=Menlo\ Regular:h14
    elseif has("gui_win32")
      set guifont=Consolas:h11:cANSI
    endif
endif

" show right margin at 80, 100 and 120+ column.
if exists('+colorcolumn')
    " 7.3+
    let &colorcolumn='80,100,'.join(range(120,500), ',')
"    highlight ColorColumn ctermbg=235 guibg=#2c2d27
else
    autocmd BufWinEnter * let w:m2=matchadd('ErrorMsg', '\%>80v.\+', -1)
endif

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"                                  Formatting
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

set noautoindent linebreak

" Highly recommended to set tab keys to 4 spaces
set expandtab shiftwidth=4 softtabstop=4
"set tabstop=4

if has("autocmd")
    filetype plugin on
endif

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"                                    Backup
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

" keep a copy of last edit - make sure the backup dir exists
set backup

if version >= 700
    set backupdir=~/.vim/backup/
    let g:netrw_home=$HOME.'/.vim/backup/'
else
    set backupdir=~/.vim6/backup/
    let g:netrw_home=$HOME.'/.vim6/backup/'
endif

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"                             Plugin Configuration
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

if version >= 700
    " powerline
    set rtp+=$PYTHON_USER_SITE/powerline/bindings/vim
    let NERDTreeIgnore=['\.vim$', '\~$', '\.pyc$', '\.svn$']
    map \ne :NERDTree<CR>
else
    let &rtp=substitute(&rtp, '\.vim', '&6', 'g')
    map \cv :GITDiff<CR>
endif

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"                                   Mappings
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

map ,fs /^sub <CR>V/{<CR>%zfj
map ,l :!perl -I "${PERL5LIB//:/ }" -cwT %<CR>
map ,v :loadview<CR>
map ,w :mkview<CR>:w<CR>

map \jh :JSHint<CR>
map \ve :VSTreeExplore<CR>

vmap <F11> :-1/^#/s///<CR>
vmap <F12> :-1/^/s//#/<CR>

vnoremap <Tab> >
vnoremap <S-Tab> <

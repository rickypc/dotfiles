# ~/.bashrc: executed by bash(1) for non-login shells.

# Source global definitions
if [ -f /etc/bashrc ]; then
    . /etc/bashrc
fi

case $(uname) in
    #'Linux') ;;
    #'FreeBSD') ;;
    'Darwin')
        # Tell ls to be colorful
        export CLICOLOR=1
        export LSCOLORS=ExGxFxdxCxDgDdabagacad
        # Tell grep to highlight matches
        export GREP_OPTIONS='--color=auto'
        ;;
esac

# If not running interactively, don't do anything
[ -z "$PS1" ] && return

# Do not put duplicate lines in the history ('ignoredups') and do not overwrite
# GNU Midnight Commander's setting of 'ignorespace'.
# Both would be ('ignoreboth'). See bash(1) for more options.
export HISTCONTROL=$HISTCONTROL${HISTCONTROL+,}ignoreboth

# append to the history file, don't overwrite it
shopt -s histappend

NONE='\[\033[0m\]'    # unsets color to term's fg color

# regular colors
R='\[\033[0;31m\]'    # red
B='\[\033[0;34m\]'    # blue

# bold colors
BY='\[\033[1;33m\]'   # bold yellow
BB='\[\033[1;34m\]'   # bold blue

if [ -f /etc/bash_completion.d/git ]; then
    #GIT_PS1_SHOWDIRTYSTATE=true
    #GIT_PS1_SHOWSTASHSTATE=true
    #GIT_PS1_SHOWUNTRACKEDFILES=true
    PS1="${R}\u${BY}@${B}\h${NONE}:${BB}\w\$(__git_ps1 ' (%s)')${BY}\$${NONE} "
elif [ -f /etc/bash_completion.d/git-prompt.sh ]; then
    . /etc/bash_completion.d/git-prompt.sh
    PS1="${R}\u${BY}@${B}\h${NONE}:${BB}\w\$(__git_ps1 ' (%s)')${BY}\$${NONE} "
elif [ -f ~/bin/git-prompt.sh ]; then
    . ~/bin/git-prompt.sh
    PS1="${R}\u${BY}@${B}\h${NONE}:${BB}\w\$(__git_ps1 ' (%s)')${BY}\$${NONE} "
else
    PS1="${R}\u${BY}@${B}\h${NONE}:${BB}\w${BY}\$${NONE} "
fi

# If this is a xterm, set the title to user@host:dir
case "$TERM" in
xterm*|rxvt*)
    PS1="\[\033]0;\u@\h: \w\a\]$PS1"
    ;;
*)
    ;;
esac

# Source alias definitions.
if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi

# ~/.zshrc: executed by zsh(1) for non-login shells.

# Source global definitions
if [ -f /etc/zshrc ]; then
  . /etc/zshrc
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
[ -z "$PROMPT" ] && return

# Do not put duplicate lines in the history ('ignoredups') and do not overwrite
# GNU Midnight Commander's setting of 'ignorespace'.
# Both would be ('ignoreboth'). See zsh(1) for more options.
export HISTCONTROL=$HISTCONTROL${HISTCONTROL+,}ignoreboth

# append to the history file, don't overwrite it
setopt APPEND_HISTORY

PROMPT="%F{red}%n%B%F{yellow}@%F{blue}%m%f: %B%F{blue}%3~ ($(echo $(git symbolic-ref HEAD | cut -d'/' -f3))) %B%F{yellow}%#%f "
RPROMPT=""

powerline-daemon -q
. $PYTHON_USER_SITE/powerline/bindings/zsh/powerline.zsh
unset RPS1

# Source alias definitions.
if [ -f ~/.bash_aliases ]; then
  . ~/.bash_aliases
fi

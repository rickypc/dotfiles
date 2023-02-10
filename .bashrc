# ~/.bashrc: executed by bash(1) for non-login shells.

# Source global definitions
if [ -f /etc/bashrc ]; then
  . /etc/bashrc
fi

if [ -f ~/.shrc ]; then
  . ~/.shrc
fi

# If not running interactively, don't do anything
[ -z "$PS1" ] && return

# append to the history file, don't overwrite it
shopt -s histappend

NONE='\[\033[0m\]'    # unsets color to term's fg color

# regular colors
R='\[\033[0;31m\]'    # red
B='\[\033[0;34m\]'    # blue

# bold colors
BY='\[\033[1;33m\]'   # bold yellow
BB='\[\033[1;34m\]'   # bold blue

if [ -f ~/.bash_completion.d/git.bash-completion ]; then
  #GIT_PS1_SHOWDIRTYSTATE=true
  #GIT_PS1_SHOWSTASHSTATE=true
  #GIT_PS1_SHOWUNTRACKEDFILES=true
  PS1="\D{%r} ${BB}\w \$(__git_ps1 ' (%s)') ${BY}\$${NONE} "
else
  PS1="\D{%r} ${BB}\w ${BY}\$${NONE} "
fi

powerline-daemon -q
# After config changes, you need to call:
# powerline-daemon --replace
. $PYTHON_USER_SITE/powerline/bindings/bash/powerline.sh

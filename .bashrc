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

if [ -f ~/.bash_completion.d/git.bash-completion ]; then
  #GIT_PS1_SHOWDIRTYSTATE=true
  #GIT_PS1_SHOWSTASHSTATE=true
  #GIT_PS1_SHOWUNTRACKEDFILES=true
  PS1="\D{%r} ${BB}\w \$(__git_ps1 ' (%s)') ${BY}\$${NONE} "
fi

eval "$(starship init bash)"

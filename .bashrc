# ~/.bashrc: executed by bash(1) for non-login shells.

# Source global definitions
[ -f /etc/bashrc ] && . /etc/bashrc
[ -f ~/.shrc ] && . ~/.shrc

# Source bash completions.
[ -f ~/.bash_completion ] && . ~/.bash_completion

# If not running interactively, don't do anything
[ -z "$PS1" ] && return

# append to the history file, don't overwrite it
shopt -s histappend

eval "$(starship init bash)"

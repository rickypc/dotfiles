# ~/.zshrc: executed by zsh(1) for non-login shells.

# Source global definitions
if [ -f /etc/zshrc ]; then
  . /etc/zshrc
fi

if [ -f ~/.shrc ]; then
  . ~/.shrc
fi

# If not running interactively, don't do anything
[ -z "$PROMPT" ] && return

# append to the history file, don't overwrite it
setopt APPEND_HISTORY

PROMPT="%t %B%F{blue}%3~ ($(echo $(git symbolic-ref HEAD | cut -d'/' -f3))) %B%F{yellow}%#%f "

powerline-daemon -q
# After config changes, you need to call:
# powerline-daemon --replace
. $PYTHON_USER_SITE/powerline/bindings/zsh/powerline.zsh

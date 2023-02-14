# ~/.zshrc: executed by zsh(1) for non-login shells.

# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Source global definitions
[ -f /etc/zshrc ] && . /etc/zshrc
[ -f ~/.shrc ] && . ~/.shrc

# If not running interactively, don't do anything
[ -z "$PROMPT" ] && return

# append to the history file, don't overwrite it
setopt APPEND_HISTORY

PROMPT="%t %B%F{blue}%3~ ($(echo $(git symbolic-ref HEAD | cut -d'/' -f3))) %B%F{yellow}%#%f "

# zsh completions.
autoload -Uz compinit && compinit

source $(brew --prefix)/opt/powerlevel10k/powerlevel10k.zsh-theme
# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

#eval "$(starship init zsh)"

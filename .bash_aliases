# ~/.bash_aliases: executed by bash(1) for all shells.

alias la='ls -A'
alias l='ls -CF'

# scp w/ resume capability
alias scpr='rsync --partial --archive --compress --progress --verbose --rsh=ssh'

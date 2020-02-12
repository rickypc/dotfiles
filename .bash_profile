# ~/.bash_profile: executed by bash(1) for login shells.

if [ -f ~/.profile ] ; then
  . ~/.profile
fi

if [ -d "$PYTHON_USER_BASE/bin" ]; then
  export POWERLINE_BASH_CONTINUATION=1
  export POWERLINE_BASH_SELECT=1
fi

# Initialize bash completions
if [[ "$(uname)" == 'Darwin' && -f ~/.bash_completion ]]; then
  . ~/.bash_completion
fi

# Include Drush customizations for bash.
#if [ -f ~/.drush/drush.bashrc ] ; then
#  . ~/.drush/drush.bashrc
#fi

# Include Drush prompt customizations.
#if [ -f ~/.drush/drush.prompt.sh ] ; then
#  . ~/.drush/drush.prompt.sh
#fi

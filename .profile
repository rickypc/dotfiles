# ~/.profile: executed by {ba|d|z}sh(1).

# Source function library.
. ~/bin/functions

unset COLORFGBG COLORTERM CVS_RSH WINDOWID

CACHE_PATH=~/.cache
CHECKSUM_PATH=~/.gcc-version
GCC_VERSION=`gcc -dumpversion`
LIB_DIR=~/Library
ANDROID_SDK=$LIB_DIR/android-sdk
GO_DIR=~/.go
GRADLE_DIR=$LIB_DIR/gradle-6.1.1
MAVEN_DIR=$LIB_DIR/apache-maven-3.6.3
PERL_DIR=$LIB_DIR/perl5

[ $MACHINE = 'arm64' ] && eval "$(/opt/homebrew/bin/brew shellenv)"

export_to_path() {
  if [[ -n "$1" && $PATH != *$1* ]]; then
    [ -z $PATH ] && export PATH=$1 || export PATH=$PATH:$1
  fi
}

gcc_process() {
  # tty will print out tty{\d} and virtual terminal will print out nothing
  if [[ "$(uname)" == 'Darwin' ]]; then
    IS_TTY=`ps -o tty $$ | grep tty`
  else
    IS_TTY=`ps --no-headers --format tty $$ | grep tty`
  fi

  if [ -z $IS_TTY ]; then
    echo -e "\ngcc version changes.\nPlease open a tty terminal and follow the instruction.\n"
  else
    echo -e "\ngcc version changes.\nAll virtual terminals will be closed and you may lose your work.\n"

    read -p 'Press [Enter] key when you are ready...'

    # write current gcc version into checksum file
    echo "$GCC_VERSION" > $CHECKSUM_PATH
    chmod 600 $CHECKSUM_PATH
  fi
}

[ ! -d $CACHE_PATH ] && mkdir -p $CACHE_PATH

if [ -f "$CHECKSUM_PATH" ]; then
  [ "$GCC_VERSION" != "$(cat $CHECKSUM_PATH)" ] && gcc_process
else
  gcc_process
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export ENV=$HOME/.shrc
export LC_ALL=en_US.UTF-8
export PHPLS_ALLOW_XDEBUG=1
export SAM_CLI_TELEMETRY=0
export XDG_CACHE_HOME=$CACHE_PATH
# export XDG_CONFIG_HOME=~/.config

case $(uname) in
  #'Linux') ;;
  #'FreeBSD') ;;
  'Darwin')
    # Tell ls to be colorful
    export CLICOLOR=1
    export JQ_COLORS="1;33:0;95:0;95:0;36:0;91:0;39:0;39:0;33"
    export LSCOLORS=ExGxFxdxCxDgDdabagacad
    # Tell grep to highlight matches
    export GREP_OPTIONS='--color=auto'
    ;;
esac

#if [ "$(ps x | grep ssh-agent | grep -v grep | wc -l)" -le 0 ]; then
#  eval "$(/usr/bin/ssh-agent -t 32400)"
#else
#  export SSH_AUTH_SOCK=$(ls /tmp/ssh-*/agent.*)
#  export SSH_AGENT_PID=$(ps x | grep ssh-agent | grep -v grep | awk '{print $1}')
#fi

# Order Matters™!
[ -d /usr/local/bin ] && export_to_path '/usr/local/bin'

# Order Matters™!
if [ $MACHINE = 'arm64' ]; then
  [ -d /usr/bin ] && export_to_path '/usr/bin'
  [ -d /bin ] && export_to_path '/bin'
fi

# Order Matters™!
[ -d /usr/local/sbin ] && export_to_path '/usr/local/sbin'

# Order Matters™!
if [ $MACHINE = 'arm64' ]; then
  [ -d /usr/sbin ] && export_to_path '/usr/sbin'
  [ -d /sbin ] && export_to_path '/sbin'
fi

# User specific environment and startup programs
if [ -d ~/bin ]; then
  export_to_path ~/bin

  if [[ $PERL5LIB != *~/bin* ]]; then
    [ -z $PERL5LIB ] && export PERL5LIB=~/bin || export PERL5LIB=~/bin:$PERL5LIB
  fi
fi

[ -d ~/.dotnet/tools ] && export_to_path ~/.dotnet/tools

PYTHON_USER_BASE=`$LOCAL/bin/python3 -m site --user-base`

if [ -d $ANDROID_SDK ]; then
  [[ $ANDROID_HOME != *${ANDROID_SDK}* ]] && export ANDROID_HOME=$ANDROID_SDK
  [ -d $ANDROID_SDK/platform-tools ] && export_to_path "$ANDROID_SDK/platform-tools"
  [ -d $ANDROID_SDK/tools ] && export_to_path "$ANDROID_SDK/tools"
fi

# Golang specific environment
export GOPATH=$GO_DIR
[ -d $GO_DIR ] && export_to_path "$GOPATH/bin"

# Gradle specific environment
if [ -d $GRADLE_DIR ]; then
  export GRADLE_HOME=$GRADLE_DIR
  export_to_path "$GRADLE_HOME/bin"
fi

[[ $JAVA_HOME != *$(/usr/libexec/java_home)* ]] && export JAVA_HOME=$(/usr/libexec/java_home)

if [[ -d /usr/share/java && $CLASSPATH != */usr/share/java* ]]; then
  [ -z $CLASSPATH ] && export CLASSPATH=/usr/share/java || export CLASSPATH=$CLASSPATH:/usr/share/java
fi

[ $MACHINE = 'arm64' ] && COMPOSER_HOME=~/.config/composer || COMPOSER_HOME=~/.composer

[ -d $COMPOSER_HOME ] && export COMPOSER_HOME

# User composer vendor
[ -d "$COMPOSER_HOME/vendor/bin" ] && export_to_path "$COMPOSER_HOME/vendor/bin"

# Maven specific environment
if [ -d $MAVEN_DIR ]; then
  export M2_HOME=$MAVEN_DIR
  export M2=$M2_HOME/bin
  export MAVEN_OPTS="-Xms32m -Xmx128m"
  export_to_path "$M2"
fi

# Perl5 specific environment
if [ -d $PERL_DIR ]; then
  export PERL_LOCAL_LIB_ROOT=$PERL_DIR
  export PERL5LIB=$PERL_DIR/lib/perl5
  export PERL_MB_OPT="--install_base \"$PERL_DIR\""
  export PERL_MM_OPT="INSTALL_BASE=$PERL_DIR"
  export_to_path "$PERL_DIR/bin"
fi

if [ -d "$PYTHON_USER_BASE/bin" ]; then
  export PYTHON_USER_SITE=`$LOCAL/bin/python3 -m site --user-site`
  export_to_path "$PYTHON_USER_BASE/bin"
fi

[ -d "$LOCAL/opt/python/libexec/bin" ] && export_to_path "$LOCAL/opt/python/libexec/bin"

if [ -d ~/.venv ]; then
  export WORKON_HOME=~/.venv
  [ -d $WORKON_HOME/default ] && . $WORKON_HOME/default/bin/activate
fi

if [ -d ~/.yarn/bin ]; then
  export_to_path ~/.yarn/bin
  export_to_path ~/.config/yarn/global/node_modules/.bin
fi

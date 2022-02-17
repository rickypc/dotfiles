# ~/.profile: executed by {ba|d|z}sh(1).

unset COLORFGBG COLORTERM CVS_RSH WINDOWID

CACHE_PATH=~/.cache
CHECKSUM_PATH=~/.gcc-version
GCC_VERSION=`gcc -dumpversion`
LIB_DIR=~/Library
ANDROID_SDK=$LIB_DIR/android-sdk
ANT_DIR=$LIB_DIR/apache-ant-1.10.7
APPIUM_PATH=~/node_modules/appium
AXIS2C_DIR=$LIB_DIR/axis2c-bin-1.6.0-linux
AXIS2JAVA_DIR=$LIB_DIR/axis2-1.7.9
CATALINA_DIR=$LIB_DIR/apache-tomcat-8.5.51
FLUTTER_DIR=$LIB_DIR/flutter
GO_DIR=~/.go
GRADLE_DIR=$LIB_DIR/gradle-6.1.1
MACHINE=$(uname -m)
MAVEN_DIR=$LIB_DIR/apache-maven-3.6.3
PERL_DIR=$LIB_DIR/perl5

if [ $MACHINE = 'arm64' ]; then
  LOCAL=/opt/homebrew
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  LOCAL=/usr/local
fi

export_to_path() {
  if [[ -n "$1" && $PATH != *$1* ]]; then
    if [ -z $PATH ]; then
      export PATH=$1
    else
      export PATH=$PATH:$1
    fi
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

    read -p "Press [Enter] key when you are ready..."

    # write current gcc version into checksum file
    echo "$GCC_VERSION" > $CHECKSUM_PATH
    chmod 600 $CHECKSUM_PATH
  fi
}

if [ -f "$CHECKSUM_PATH" ]; then
  if [ "$GCC_VERSION" != "$(cat $CHECKSUM_PATH)" ]; then
    gcc_process
  fi
else
  gcc_process
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export LC_ALL=en_US.UTF-8
export SAM_CLI_TELEMETRY=0

#if [ "$(ps x | grep ssh-agent | grep -v grep | wc -l)" -le 0 ]; then
#  eval "$(/usr/bin/ssh-agent -t 32400)"
#else
#  export SSH_AUTH_SOCK=$(ls /tmp/ssh-*/agent.*)
#  export SSH_AGENT_PID=$(ps x | grep ssh-agent | grep -v grep | awk '{print $1}')
#fi

if [ -d $LOCAL/sbin ]; then
  export_to_path "$LOCAL/sbin"
fi

if [ -d $LOCAL/bin ]; then
  export_to_path "$LOCAL/bin"
fi

# User specific environment and startup programs
if [ -d ~/bin ]; then
  export_to_path ~/bin

  if [[ $PERL5LIB != *~/bin* ]]; then
    if [ -z $PERL5LIB ]; then
      export PERL5LIB=~/bin
    else
      export PERL5LIB=~/bin:$PERL5LIB
    fi
  fi
fi

if [ -d ~/.dotnet/tools ]; then
  export_to_path ~/.dotnet/tools
fi

if [ ! -d $CACHE_PATH ]; then
  mkdir -p $CACHE_PATH
fi

export PHPLS_ALLOW_XDEBUG=1
export XDG_CACHE_HOME=$CACHE_PATH
# export XDG_CONFIG_HOME=~/.config

PYTHON_USER_BASE=`$LOCAL/bin/python3 -m site --user-base`

if [ -d $ANDROID_SDK ]; then
  if [[ $ANDROID_HOME != *${ANDROID_SDK}* ]]; then
    export ANDROID_HOME=$ANDROID_SDK
  fi

  if [ -d $ANDROID_SDK/platform-tools ]; then
    export_to_path "$ANDROID_SDK/platform-tools"
  fi

  if [ -d $ANDROID_SDK/tools ]; then
    export_to_path "$ANDROID_SDK/tools"
  fi
fi

# Ant specific environment
if [ -d $ANT_DIR ]; then
  export ANT_HOME=$ANT_DIR
  export_to_path "$ANT_HOME/bin"
fi

if [[ -d $APPIUM_PATH && $APPIUM_HOME != *${APPIUM_PATH}* ]]; then
  export APPIUM_HOME=$APPIUM_PATH
fi

# Axis/C specific environment
if [ -d $AXIS2C_DIR ]; then
  export AXIS2C_HOME=$AXIS2C_DIR
#  export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$AXIS2C_HOME/lib/
#  export PKG_CONFIG_PATH=$PKG_CONFIG_PATH:$AXIS2C_HOME/lib/pkgconfig
fi

# Axis/Java specific environment
if [ -d $AXIS2JAVA_DIR ]; then
  export AXIS2_HOME=$AXIS2JAVA_DIR
fi

# Catalina specific environment
if [ -d $CATALINA_DIR ]; then
  export CATALINA_BASE=$CATALINA_DIR
  export CATALINA_HOME=$CATALINA_DIR
  export_to_path "$CATALINA_HOME/bin"
fi

if [ -d $FLUTTER_DIR ]; then
  export_to_path "$FLUTTER_DIR/bin"
fi

# Golang specific environment
export GOPATH=$GO_DIR
if [ -d $GO_DIR ]; then
  export_to_path "$GOPATH/bin"
fi

# Gradle specific environment
if [ -d $GRADLE_DIR ]; then
  export GRADLE_HOME=$GRADLE_DIR
  export_to_path "$GRADLE_HOME/bin"
fi

if [[ $JAVA_HOME != *$(/usr/libexec/java_home)* ]]; then
  export JAVA_HOME=$(/usr/libexec/java_home)
fi

if [[ -d /usr/share/java && $CLASSPATH != */usr/share/java* ]]; then
  if [ -z $CLASSPATH ]; then
    export CLASSPATH=/usr/share/java
  else
    export CLASSPATH=$CLASSPATH:/usr/share/java
  fi
fi

if [ -d ~/.composer ]; then
  export COMPOSER_HOME=~/.composer
fi

# User composer vendor
if [ -d "$COMPOSER_HOME/vendor/bin" ]; then
  export_to_path "$COMPOSER_HOME/vendor/bin"
fi

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
  export POWERLINE_CONFIG_COMMAND=powerline-config
  export PYTHON_USER_SITE=`$LOCAL/bin/python3 -m site --user-site`
  export_to_path "$PYTHON_USER_BASE/bin"
fi

if [ -d "$LOCAL/opt/python/libexec/bin" ]; then
  export_to_path "$LOCAL/opt/python/libexec/bin"
fi

if [ -d ~/.virtualenvs ]; then
  export WORKON_HOME=~/.virtualenvs
  if [ -d $WORKON_HOME/default ]; then
    . $WORKON_HOME/default/bin/activate
  fi
fi

# ~/.bash_profile: executed by bash(1) for login shells.

unset COLORFGBG COLORTERM CVS_RSH WINDOWID

CHECKSUM_PATH=~/.gcc-version
GCC_VERSION=`gcc -dumpversion`
LIB_DIR=~/Library
ANDROID_SDK=$LIB_DIR/android-sdk
ANT_DIR=$LIB_DIR/apache-ant-1.9.7
APPIUM_PATH=~/node_modules/appium
AXIS2C_DIR=$LIB_DIR/axis2c-bin-1.6.0-linux
AXIS2JAVA_DIR=$LIB_DIR/axis2-1.6.2
CATALINA_DIR=$LIB_DIR/apache-tomcat-7.0.37
GRADLE_DIR=$LIB_DIR/gradle-2.12
MAMP_DIR=/Applications/MAMP
MAVEN_DIR=$LIB_DIR/apache-maven-3.0.5
PHP_VERSION=5.6.10

composer() {
    $MAMP_DIR/bin/php/php${PHP_VERSION}/bin/php $HOME/bin/composer.phar $@
}

drush() {
    $MAMP_DIR/bin/php/php${PHP_VERSION}/bin/php $HOME/bin/drush.phar $@
}

phpmd() {
    $MAMP_DIR/bin/php/php${PHP_VERSION}/bin/php $HOME/bin/phpmd.phar $@
}

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
    PREVIOUS_VERSION=`cat $CHECKSUM_PATH`

    if [ "$GCC_VERSION" != "$PREVIOUS_VERSION" ]; then
        gcc_process
    fi
else
    gcc_process
fi

#if [ "$(ps x | grep ssh-agent | grep -v grep | wc -l)" -le 0 ]; then
#    eval "$(/usr/bin/ssh-agent -t 32400)"
#else
#    export SSH_AUTH_SOCK=$(ls /tmp/ssh-*/agent.*)
#    export SSH_AGENT_PID=$(ps x | grep ssh-agent | grep -v grep | awk '{print $1}')
#fi

# Get the aliases and functions
if [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi

# User specific environment and startup programs
if [ -d ~/bin ]; then
    export_to_path "$HOME/bin"

    if [[ $PERL5LIB != *$HOME/bin* ]]; then
        if [ -z $PERL5LIB ]; then
            export PERL5LIB=$HOME/bin
        else
            export PERL5LIB=$HOME/bin:$PERL5LIB
        fi
    fi
fi

if [ -d /usr/local/bin ]; then
    export_to_path "/usr/local/bin"
fi

# Initialize bash completions
if [[ "$(uname)" == 'Darwin' && -f $HOME/.bash_completion ]]; then
    . $HOME/.bash_completion
fi

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
#    export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$AXIS2C_HOME/lib/
#    export PKG_CONFIG_PATH=$PKG_CONFIG_PATH:$AXIS2C_HOME/lib/pkgconfig
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

# Include Drush bash customizations.
#if [ -f "$HOME/.drush/drush.bashrc" ] ; then
#  source $HOME/.drush/drush.bashrc
#fi

# Include Drush prompt customizations.
#if [ -f "$HOME/.drush/drush.prompt.sh" ] ; then
#  source $HOME/.drush/drush.prompt.sh
#fi

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

# MAMP specific environment
if [ -d $MAMP_DIR ]; then
    export -f composer
    export -f drush
    export_to_path "$MAMP_DIR/Library/bin"
fi

# Maven specific environment
if [ -d $MAVEN_DIR ]; then
    export M2_HOME=$MAVEN_DIR
    export M2=$M2_HOME/bin
    export MAVEN_OPTS="-Xms32m -Xmx128m"
    export_to_path "$M2"
fi

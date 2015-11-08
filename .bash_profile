# ~/.bash_profile: executed by bash(1) for login shells.

unset COLORFGBG COLORTERM CVS_RSH WINDOWID

CHECKSUM_PATH=~/.gcc-version
GCC_VERSION=`gcc -dumpversion`
LIB_DIR=~/Libraries
ANDROID_SDK=$LIB_DIR/android-sdk
ANT_DIR=$LIB_DIR/apache-ant-1.8.4
APPIUM_PATH=~/node_modules/appium
#AXIS2C_DIR=$LIB_DIR/axis2c-bin-1.6.0-linux
AXIS2C_DIR=/usr
AXIS2JAVA_DIR=$LIB_DIR/axis2-1.6.2
MAVEN_DIR=$LIB_DIR/apache-maven-3.0.5

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

export CATALINA_HOME=$LIB_DIR/apache-tomcat-7.0.37
export CATALINA_BASE=$CATALINA_HOME

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
if [[ -d ~/bin && $PATH != *~/bin* ]]; then
    if [[ -z $PATH ]]; then
        PATH=~/bin
    else
        PATH=$PATH:~/bin
    fi
    export PATH
fi

if [[ -d ~/bin && $PERL5LIB != *~/bin* ]]; then
    PERL5LIB=~/bin:$PERL5LIB
    export PERL5LIB
fi

if [[ -d /usr/local/bin && $PATH != */usr/local/bin* ]]; then
    PATH=$PATH:/usr/local/bin
    export PATH
fi

# Initialize Perl bash completion plugins
if [ -f /usr/local/bin/setup-bash-complete ]; then
    . /usr/local/bin/setup-bash-complete
fi

if [ -d $ANDROID_SDK ]; then
    if [[ $ANDROID_HOME != *${ANDROID_SDK}* ]]; then
        export ANDROID_HOME=$ANDROID_SDK
    fi

    if [[ -d $ANDROID_SDK/platform-tools && $PATH != *$ANDROID_SDK/platform-tools* ]]; then
        export PATH=$PATH:$ANDROID_SDK/platform-tools
    fi

    if [[ -d $ANDROID_SDK/tools && $PATH != *$ANDROID_SDK/tools* ]]; then
        export PATH=$PATH:$ANDROID_SDK/tools
    fi
fi

# Ant specific environment
if [ -d $ANT_DIR ]; then
    export ANT_HOME=$ANT_DIR
    export PATH=$PATH:$ANT_HOME/bin
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
if [[ $PATH != *$CATALINA_HOME/bin* ]]; then
    if [ -z $PATH ]; then
        export PATH=$CATALINA_HOME/bin
    else
        export PATH=$PATH:$CATALINA_HOME/bin
    fi
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

# Maven specific environment
if [ -d $MAVEN_DIR ]; then
    export M2_HOME=$MAVEN_DIR
    export M2=$M2_HOME/bin
    export MAVEN_OPTS="-Xms32m -Xmx128m"
    export PATH=$PATH:$M2
fi

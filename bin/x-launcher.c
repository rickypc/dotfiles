/*
 *    X Launcher Server - A socket server running inside Colinux to execute requested command.
 *    Copyright (C) 2012-2015  Richard Huang <rickypc@users.noreply.github.com>
 *
 *    This program is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Affero General Public License as
 *    published by the Free Software Foundation, either version 3 of the
 *    License, or (at your option) any later version.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <syslog.h>
#include <unistd.h>

// gcc -O3 -o x-launcher x-launcher.c; ./x-launcher
// time gcc -O3 -o x-launcher x-launcher.c; ./x-launcher
// time gcc -O3 -o x-launcher x-launcher.c; valgrind --leak-check=full --show-reachable=yes -v ./x-launcher

#define BACKLOG         5
#define BUFFER_SIZE     1025
#define LOCAL_PORT      2081
#define NO              0
//#define PROG_NAME       "x-launcher"
#define YES             1

int chomp( char * );
void do_request( int );
void error( const char *, int );
void sigterm_callback_handler( int );

int listenfd = 0;

int main( int argc, char *argv[] ) {
    // we don't care about children status - release defunct child immediately
    signal( SIGCHLD, SIG_IGN );

    // register SIGTERM signal and its handler
    signal( SIGTERM, sigterm_callback_handler );

    int connfd = 0, yes = YES;
    pid_t pid;

    const struct sockaddr_in serv_addr = {
        .sin_family = AF_INET, .sin_addr.s_addr = htonl( INADDR_ANY ), .sin_port = htons( LOCAL_PORT )
    };

    if( ( listenfd = socket( AF_INET, SOCK_STREAM, 0 ) ) < 0 ) {
        error( "Error creating local socket", YES );
    }

    if( setsockopt( listenfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof( yes ) ) < 0) {
        error( "Error reusing local socket", YES );
    }

    if( bind( listenfd, (struct sockaddr*) &serv_addr, sizeof( serv_addr ) ) < 0 ) {
        char error_message[ BUFFER_SIZE ];
        snprintf( error_message, BUFFER_SIZE, "Error binding local socket on %s:%d", inet_ntoa( serv_addr.sin_addr ), ntohs( serv_addr.sin_port ) );
        error_message[ strlen( error_message) ] = '\0';
        error( error_message, YES );
    }

    listen( listenfd, BACKLOG );
    syslog( LOG_MAKEPRI( LOG_DAEMON, LOG_NOTICE ), "Listening on %s:%d", inet_ntoa( serv_addr.sin_addr ), ntohs( serv_addr.sin_port ) );

    // run infinite
    while( YES ) {
        if( ( connfd = accept( listenfd, (struct sockaddr*) NULL, NULL ) ) >= 0 ) {
            if( ( pid = fork() ) == 0 ) {
                close( listenfd );      // child closes listening socket
                do_request( connfd );   // process the request
                close( connfd );        // closes child connected socket
                _exit( 0 );             // child terminates
            } else if( pid < 0 ) {
                error( "Error forking process", NO );
            }
        } else {
            error( "Error accepting request", NO );
        }

        close( connfd );                // closes parent connected socket
        sleep( 1 );
    }

    // out of reach - just in case
    close( listenfd );

    return 0;
}

int chomp( char *s ) {
    if( s && *s ) {
        s += strlen( s ) - 1;

        if( *s == '\n' ) {
            *s = 0;
            return 1;
        }
    }

    return 0;
}

void do_request( int connfd ) {
    char read_buffer[ BUFFER_SIZE ] = { 0 };

    if( read( connfd, read_buffer, BUFFER_SIZE ) >= 0 ) {
        chomp( read_buffer );
        system( read_buffer );
    } else {
        error( "Error getting request", NO );
    }
}

void error( const char *message, int terminate ) {
    // 4 = 3 of ' - ' and 1 of '\0'
    /*
    size_t final_message_length = strlen( PROG_NAME ) + strlen( message ) + 4;
    char final_message[ final_message_length ];
    snprintf( final_message, final_message_length, "%s - %s", PROG_NAME, message );
    final_message[ final_message_length - 1 ] = '\0';

    perror( final_message );
    */
    syslog( LOG_MAKEPRI( LOG_DAEMON, LOG_ERR ), "%s", message );

    if( terminate ) {
        exit( errno );
    }
}

void sigterm_callback_handler( int signum ) {
    syslog( LOG_MAKEPRI( LOG_DAEMON, LOG_NOTICE ), "SIGTERM: %d", signum );
    close( listenfd );
    kill( 0, SIGKILL );
    exit( signum );
}

/*
 *    X Launcher Client - Send command to socket server running inside Colinux.
 *    Copyright © 2012 Richard Huang <rickypc@users.noreply.github.com>
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

#include <sys/socket.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <netdb.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
#include <arpa/inet.h>

// gcc -O3 -o x-launcher-client x-launcher-client.c; ./x-launcher-client 127.0.0.1
// time gcc -O3 -o x-launcher-client x-launcher-client.c; ./x-launcher-client 127.0.0.1
// time gcc -O3 -o x-launcher-client x-launcher-client.c; valgrind --leak-check=full --show-reachable=yes -v ./x-launcher-client 127.0.0.1

#define BUFFER_SIZE     1025
#define LOCAL_PORT      2081

int main(int argc, char *argv[])
{
    int sockfd = 0, n = 0;
    char recvBuff[1024];

    struct sockaddr_in serv_addr = {
        .sin_family = AF_INET, .sin_port = htons( LOCAL_PORT )
    };

    if(argc != 2)
    {
        printf("\nUsage: %s <server_ip_address>\n",argv[0]);
        return 1;
    }

    memset(recvBuff, '0',sizeof(recvBuff));
    if((sockfd = socket(AF_INET, SOCK_STREAM, 0)) < 0)
    {
        printf("\nError: Could not create socket\n");
        return 1;
    }

    //memset(&serv_addr, '0', sizeof(serv_addr));
    //serv_addr.sin_family = AF_INET;
    //serv_addr.sin_port = htons(2081);

    if(inet_pton(AF_INET, argv[1], &serv_addr.sin_addr)<=0)
    {
        printf("\nError: in inet_pton\n");
        return 1;
    }

    printf("%d %d %d\n", serv_addr.sin_family, serv_addr.sin_addr.s_addr, serv_addr.sin_port);

    if( connect(sockfd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0)
    {
       printf("\nError: Connection failed\n");
       return 1;
    }

    printf("Connected to: %s:%d\n", inet_ntoa(serv_addr.sin_addr), ntohs(serv_addr.sin_port));

    char send_buffer[ BUFFER_SIZE ];
    bzero( send_buffer, BUFFER_SIZE );

    snprintf( send_buffer, sizeof( send_buffer ), "%s\n", "urxvt");
    write( sockfd, send_buffer, strlen( send_buffer ) );

    printf("Command sent: '%s'\n", send_buffer);

    while ( (n = read(sockfd, recvBuff, sizeof(recvBuff)-1)) > 0)
    {
        recvBuff[n] = 0;
        if(fputs(recvBuff, stdout) == EOF)
        {
            printf("\nError: Fputs error\n");
        }
    }

    if(n < 0)
    {
        printf("\nError: Read error\n");
    }

    return 0;
}

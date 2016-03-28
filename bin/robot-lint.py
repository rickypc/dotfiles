#!/usr/bin/env python
# -*- coding: utf-8 -*-
# pylint: disable=invalid-name

#    Robot Lint - Lint Robot Framework data files.
#    Copyright (c) 2014, 2015, 2016 Richard Huang <rickypc@users.noreply.github.com>
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.

"""
Robot Lint - Lint Robot Framework data files.
"""

from __future__ import print_function
from glob import glob
from os.path import expanduser, join
# pylint: disable=redefined-builtin
from sys import argv, exit, stderr
from rflint import RfLint


class RobotLint(RfLint):
    """Robot Lint class."""

    def __init__(self):
        """Initialize Robot Lint class."""
        config = {
            'TooFewKeywordSteps': (0,),
            'TooFewTestSteps': (0,),
            'TrailingBlankLines': (1,),
        }
        RfLint.__init__(self)
        user_rules = join(expanduser('~'), '.rflint.d')
        for user_rule in glob('%s/*.py' % user_rules):
            if user_rule.endswith('.__init__.py'):
                continue
            self._load_rule_file(user_rule)
        # pylint: disable=expression-not-assigned
        [rule.configure(*config[rule.name]) for rule in self.all_rules
         if rule.name in config.keys()]


def main(cli_args=None):
    """Lint all given Robot Framework data files."""
    response = -1
    try:
        response = RobotLint().run(cli_args)
    # pylint: disable=broad-except
    except Exception, e:
        stderr.write('%s\n' % str(e))
    return response


if __name__ == '__main__':
    if len(argv) == 1:
        argv.append('--help')
    exit(main(argv[1:]))

#!/usr/bin/env python
# -*- coding: utf-8 -*-

#    Robot Lint Rules - Lint rules for Robot Framework data files.
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
Robot Lint Rules - Lint rules for Robot Framework data files.
"""

from rflint.common import GeneralRule, WARNING
from rflint.parser import VariableTable
from rflint.parser.tables import SimpleTableMixin


class VariableTableHelper(SimpleTableMixin):
    """A table made up of zero or more rows."""

    def __init__(self, rows):
        """Initialize variable table helper."""
        self.rows = rows


class SplitUpVariableNameValue(GeneralRule):
    """Warn about variable name and value on the same line.

    Variable name and value on the same line can lead to source control
    merging problem.
    """
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        for table in robot_file.tables:
            if isinstance(table, VariableTable):
                for statement in VariableTableHelper(table.rows).statements:
                    if not statement.is_comment() and \
                       not self._is_breakline(statement):
                        if statement.startline == statement.endline:
                            self.report(robot_file,
                                        ('Variable name "%s" and its value ' +
                                        'should be on two different lines.') %
                                        statement[0], statement.startline)

    @staticmethod
    def _is_breakline(statement):
        """Returns True if statement is a breakline, False otherwise."""
        return len(statement) == 1 and statement[0].strip() == ''

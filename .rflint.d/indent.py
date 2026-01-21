#!/usr/bin/env python
# -*- coding: utf-8 -*-

#    Robot Lint Rules - Lint rules for Robot Framework data files.
#    Copyright © 2014 Richard Huang <rickypc@users.noreply.github.com>
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

from difflib import ndiff
from re import sub
from rflint.common import GeneralRule, KeywordRule, TestRule, WARNING
from rflint.parser import SettingTable, VariableTable


def _get_diffs(actual, expected):
    """Returns actual and expected differences if any."""
    return [i for i, char in enumerate(ndiff(actual, expected))
            if char[0] != ' ']


def _get_expected(row, delimiter, initial=''):
    """Returns expected text."""
    cells = row.cells
    if _is_comment(cells):
        delimiter = ''
    expected = delimiter.join([cell.strip() for cell in cells])
    if len(expected) > 0:
        if '|' in delimiter:
            expected = '| %s |' % expected
        elif delimiter.strip() == '':
            expected = sub(r'^\s*', initial, expected, 1)
    return expected


def _is_comment(cells):
    """Returns True if it is a comment row, False otherwise."""
    for cell in cells:
        if cell.strip() == '':
            continue
        return cell.lstrip().startswith('#')
    return False


def _verify_rows_indent(rows, delimiter, initial, reporter):
    """Verifies every row indentation."""
    for row in rows:
        expected = _get_expected(row, delimiter, initial)
        diffs = _get_diffs(row.raw_text, expected)
        if len(diffs) > 0:
            reporter(row.linenumber, diffs[0])


class KeywordIndentSize(KeywordRule):
    """Warn about keyword indent size.
    """
    delimiter = '  '
    initial = '    '
    message = 'Keyword indent size does not match.'
    severity = WARNING

    def apply(self, keyword):
        """Apply the rule to given keyword."""
        _verify_rows_indent(keyword.rows, self.delimiter, self.initial,
                            lambda line, col:
                            self.report(keyword, self.message, line, col))

    def configure(self, delimiter, initial):
        """Configures the rule."""
        if '|' in delimiter:
            delimiter = ' | '
        self.delimiter = delimiter
        self.initial = initial


class SettingIndentSize(GeneralRule):
    """Warn about setting indent size.
    """
    delimiter = '  '
    message = 'Setting indent size does not match.'
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        # pylint: disable=expression-not-assigned
        [_verify_rows_indent(table.rows, self.delimiter, '', lambda line, col:
                             self.report(robot_file, self.message, line, col))
         for table in robot_file.tables if isinstance(table, SettingTable)]

    def configure(self, delimiter):
        """Configures the rule."""
        if '|' in delimiter:
            delimiter = ' | '
        self.delimiter = delimiter


class TestIndentSize(TestRule):
    """Warn about test indent size.
    """
    delimiter = '  '
    initial = '    '
    message = 'Test indent size does not match.'
    severity = WARNING

    def apply(self, test):
        """Apply the rule to given test."""
        _verify_rows_indent(test.rows, self.delimiter, self.initial,
                            lambda line, col:
                            self.report(test, self.message, line, col))

    def configure(self, delimiter, initial):
        """Configures the rule."""
        if '|' in delimiter:
            delimiter = ' | '
        self.delimiter = delimiter
        self.initial = initial


class VariableIndentSize(GeneralRule):
    """Warn about variable indent size.
    """
    delimiter = '  '
    message = 'Variable indent size does not match.'
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        # pylint: disable=expression-not-assigned
        [_verify_rows_indent(table.rows, self.delimiter, '', lambda line, col:
                             self.report(robot_file, self.message, line, col))
         for table in robot_file.tables if isinstance(table, VariableTable)]

    def configure(self, delimiter):
        """Configures the rule."""
        if '|' in delimiter:
            delimiter = ' | '
        self.delimiter = delimiter

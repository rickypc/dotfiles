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

from difflib import ndiff
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
            expected = expected.replace(delimiter, initial, 1)
    return expected


def _is_comment(cells):
    """Returns True if it is a comment row, False otherwise."""
    for cell in cells:
        if cell.strip() == '':
            continue
        if cell.lstrip().startswith('#'):
            return True
    return False


class KeywordIndentSize(KeywordRule):
    """Warn about keyword indent size.
    """
    delimiter = '  '
    initial = '    '
    severity = WARNING

    def apply(self, keyword):
        """Apply the rule to given keyword."""
        for row in keyword.rows:
            expected = _get_expected(row, self.delimiter, self.initial)
            diffs = _get_diffs(row.raw_text, expected)
            if len(diffs) > 0:
                message = 'Keyword indent size does not match.'
                self.report(keyword, message, row.linenumber, diffs[0])

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
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        for table in robot_file.tables:
            if isinstance(table, SettingTable):
                for row in table.rows:
                    expected = _get_expected(row, self.delimiter)
                    diffs = _get_diffs(row.raw_text, expected)
                    if len(diffs) > 0:
                        message = 'Setting indent size does not match.'
                        self.report(robot_file, message, row.linenumber,
                                    diffs[0])

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
    severity = WARNING

    def apply(self, test):
        """Apply the rule to given test."""
        for row in test.rows:
            expected = _get_expected(row, self.delimiter, self.initial)
            diffs = _get_diffs(row.raw_text, expected)
            if len(diffs) > 0:
                message = 'Test indent size does not match.'
                self.report(test, message, row.linenumber, diffs[0])

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
    severity = WARNING

    def apply(self, robot_file):
        """Apply the rule to given robot file."""
        for table in robot_file.tables:
            if isinstance(table, VariableTable):
                for row in table.rows:
                    expected = _get_expected(row, self.delimiter)
                    diffs = _get_diffs(row.raw_text, expected)
                    if len(diffs) > 0:
                        message = 'Variable indent size does not match.'
                        self.report(robot_file, message, row.linenumber,
                                    diffs[0])

    def configure(self, delimiter):
        """Configures the rule."""
        if '|' in delimiter:
            delimiter = ' | '
        self.delimiter = delimiter

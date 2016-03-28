#!/usr/bin/env python
# -*- coding: utf-8 -*-
# pylint: disable=invalid-name

#    Robot Parallel - Run Robot Framework data sources in parallel.
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
Robot Parallel - Run Robot Framework data sources in parallel.
"""

from __future__ import print_function
from binascii import hexlify
from datetime import datetime
from multiprocessing import cpu_count, Pool
from os import listdir, sep, urandom
from os.path import abspath, basename, dirname, isdir, isfile, join, splitext
from subprocess import PIPE, Popen, STDOUT
# pylint: disable=redefined-builtin
from sys import argv, executable, exit
from robot.api import ResultWriter, SuiteVisitor
from robot.conf import RebotSettings
from robot.output.console import ConsoleOutput
from robot.reporting.resultwriter import Results
from robot.result import TestSuite
from robot.run import USAGE
from robot.utils.argumentparser import ArgumentParser


class ParallelTestSuite(TestSuite):
    """Overrides test suite model to support parallel statistics."""

    def __init__(self, statistics=None, **kwargs):
        TestSuite.__init__(self, **kwargs)
        self._statistics = statistics

    @property
    def statistics(self):
        """Suite statistics as
        a :class:`~robot.model.totalstatistics.TotalStatistics` object.

        Recreated every time this property is accessed, so saving the results
        to a variable and inspecting it is often a good idea::

            stats = suite.statistics
            print stats.critical.failed
            print stats.all.total
            print stats.message
        """
        return self._statistics


class RenameTestSuite(SuiteVisitor):
    """Remove namespaces from test suite name."""

    def __init__(self, root_name):
        self.root_name = root_name

    def end_suite(self, suite):
        """Called when suite ends."""
        suite.name = suite.name.replace('%s.' % self.root_name, '')


class RobotParallel(object):
    """Robot framework parallel run for given data sources."""

    def __init__(self):
        """Initializes robot parallel class."""
        self._ap = ArgumentParser(USAGE, arg_limits=(1,),
                                  env_options='ROBOT_OPTIONS',
                                  validator=self._validate)
        self.inputs = {
            'args': [],
            'datas': [],
            'output': None,
            'output_dir': None,
            'outputs': [],
            'rerun': False,
            'root_name': None,
            'shell': sep == '\\',
            'start_time': self._get_timestamp()
        }
        self.logger = None
        self.responses = None

    def execute(self, processor, processes=None, max_tasks=4):
        """Executes all prepared commands in their own respective worker."""
        pool = Pool(processes=processes, maxtasksperchild=max_tasks)
        try:
            self.responses = pool.imap(processor, self.inputs['datas'])
            pool.close()
        except KeyboardInterrupt:
            try:
                pool.terminate()
                pool.join()
            # pylint: disable=undefined-variable
            except WindowsError:
                pass

    @staticmethod
    def exit(exit_code):
        """Exit from this run with given exit code."""
        exit(exit_code)

    def flush_stdout(self):
        """Flush stdout responses."""
        for response in self.responses:
            if not isfile(response['output']):
                self.inputs['outputs'].remove(response['output'])
            output = response['stdout']
            if output != '':
                if self.inputs['shell']:
                    output = output.replace('\r\n', '\n')
                print(output)
                # self.logger.console(output)

    def merge_results(self):
        """Merges all output results into one output."""
        root_name = self.inputs['root_name']
        options = {
            'endtime': self._get_timestamp(),
            'name': root_name,
            'output': self.inputs['output'],
            'outputdir': self.inputs['output_dir'],
            'starttime': self.inputs['start_time']
        }
        if self.inputs['rerun']:
            options['prerebotmodifier'] = RenameTestSuite(root_name)
        settings = RebotSettings(**options)
        result = Results(settings, *self.inputs['outputs']).result
        suite = ParallelTestSuite(name=options['name'],
                                  statistics=result.statistics.total)
        # pylint: disable=protected-access
        self.logger._writer.suite_separator()
        self.logger.end_suite(suite)
        return ResultWriter(*(result,)).write_results(settings)

    def parse_arguments(self, cli_args):
        """Parses data inputs dictionary from given CLI arguments."""
        options, arguments = self._ap.parse_args(cli_args)
        self.logger = ConsoleOutput(colors=options.get('consolecolors',
                                                       'AUTO'),
                                    stderr=options.get('stderr', None),
                                    stdout=options.get('stdout', None))
        self.inputs['root_name'] = options.get('name',
                                               self._get_name(arguments[0]))
        self.inputs['output'] = options.pop('output', 'output.xml')
        self.inputs['output_dir'] = abspath(options.pop('outputdir', '.'))
        self.inputs['rerun'] = 'rerunfailed' in options
        self.inputs['args'] = self._generate_worker_arguments(options)
        self._generate_worker_inputs(arguments)

    @staticmethod
    def _validate(options, arguments):
        """Validates options and arguments."""
        return dict((name, value) for name, value in options.items()
                    if value not in (None, [])), arguments

    def _append_worker_data(self, source):
        """Append source as part of worker data."""
        output = 'output-%s.xml' % hexlify(urandom(16))
        output_path = join(self.inputs['output_dir'], output)
        commands = self.inputs['args'][:]
        if self.inputs['rerun']:
            commands += ['--name', '%s.%s' % (self.inputs['root_name'],
                                              self._get_name(source, False))]
        commands += ['--output', output, source]
        self.inputs['datas'].append({'commands': commands,
                                     'output': output_path})
        self.inputs['outputs'].append(output_path)

    def _generate_worker_arguments(self, options):
        """Returns generated worker CLI arguments."""
        responses = [executable, '-m', 'robot']
        options['log'] = 'NONE'
        options.pop('name', None)
        options['nostatusrc'] = True
        options['outputdir'] = self.inputs['output_dir']
        options['report'] = 'NONE'
        if self.inputs['rerun']:
            options['runemptysuite'] = True
        options['variable'] = options.get('variable', [])
        options['variable'].append('ROBOT_PARALLEL:True')
        for key, value in options.iteritems():
            if isinstance(value, bool):
                responses.append('--%s' % key)
            elif isinstance(value, list):
                for item in value:
                    responses.append('--%s' % key)
                    responses.append(item)
            else:
                responses.append('--%s' % key)
                responses.append(value)
        return responses

    def _generate_worker_inputs(self, paths):
        """Generates worker data inputs."""
        for path in paths:
            if isdir(path):
                for file_name in listdir(path):
                    file_path = join(path, file_name)
                    if isfile(file_path):
                        self._append_worker_data(file_path)
            else:
                self._append_worker_data(path)

    @staticmethod
    def _get_name(path, top_level=True):
        """Returns suite name created from data source path."""
        file_path = splitext(path)[0]
        target = dirname(file_path) or file_path if top_level else file_path
        tail = basename(target)
        name = tail.split('__', 1)[-1].replace('_', ' ')
        return name.strip().title()

    @staticmethod
    def _get_timestamp():
        """Returns timestamp."""
        return datetime.now().strftime('%Y%m%d%H%M%S%f')


def main(cli_args):
    """Run all given Robot Framework data sources in parallel."""
    robot_parallel = RobotParallel()
    try:
        robot_parallel.parse_arguments(cli_args)
        robot_parallel.execute(worker, (cpu_count() * 2) - 1)
        robot_parallel.flush_stdout()
    # pylint: disable=broad-except
    except Exception:
        pass
    finally:
        return_code = robot_parallel.merge_results()
        robot_parallel.exit(return_code)


def worker(data):
    """Pool worker."""
    output = ''
    try:
        output = Popen(data['commands'], bufsize=-1, stdout=PIPE,
                       stderr=STDOUT).communicate()[0]
    except KeyboardInterrupt:
        pass
    return {'output': data['output'], 'stdout': output}


if __name__ == '__main__':
    main(argv[1:])

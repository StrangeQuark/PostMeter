const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LINUX_SECCOMP_FILTER_FD = 3;

const BPF_LD = 0x00;
const BPF_W = 0x00;
const BPF_ABS = 0x20;
const BPF_JMP = 0x05;
const BPF_JEQ = 0x10;
const BPF_JGE = 0x30;
const BPF_K = 0x00;
const BPF_RET = 0x06;

const SECCOMP_DATA_NR_OFFSET = 0;
const SECCOMP_DATA_ARCH_OFFSET = 4;
const SECCOMP_RET_KILL_PROCESS = 0x80000000;
const SECCOMP_RET_ERRNO = 0x00050000;
const SECCOMP_RET_ALLOW = 0x7fff0000;
const AUDIT_ARCH_X86_64 = 0xc000003e;
const X32_SYSCALL_BIT = 0x40000000;
const EPERM = 1;
const ENOSYS = 38;

const X64_DENIED_SYSCALLS = Object.freeze([
  ['fork', 57, EPERM],
  ['vfork', 58, EPERM],
  ['ptrace', 101, EPERM],
  ['syslog', 103, EPERM],
  ['personality', 135, EPERM],
  ['chroot', 161, EPERM],
  ['mount', 165, EPERM],
  ['umount2', 166, EPERM],
  ['swapon', 167, EPERM],
  ['swapoff', 168, EPERM],
  ['reboot', 169, EPERM],
  ['sethostname', 170, EPERM],
  ['setdomainname', 171, EPERM],
  ['iopl', 172, EPERM],
  ['ioperm', 173, EPERM],
  ['init_module', 175, EPERM],
  ['delete_module', 176, EPERM],
  ['quotactl', 179, EPERM],
  ['nfsservctl', 180, EPERM],
  ['lookup_dcookie', 212, EPERM],
  ['mbind', 237, EPERM],
  ['set_mempolicy', 238, EPERM],
  ['kexec_load', 246, EPERM],
  ['add_key', 248, EPERM],
  ['request_key', 249, EPERM],
  ['keyctl', 250, EPERM],
  ['migrate_pages', 256, EPERM],
  ['move_pages', 279, EPERM],
  ['perf_event_open', 298, EPERM],
  ['fanotify_init', 300, EPERM],
  ['fanotify_mark', 301, EPERM],
  ['name_to_handle_at', 303, EPERM],
  ['open_by_handle_at', 304, EPERM],
  ['setns', 308, EPERM],
  ['process_vm_readv', 310, EPERM],
  ['process_vm_writev', 311, EPERM],
  ['finit_module', 313, EPERM],
  ['seccomp', 317, EPERM],
  ['bpf', 321, EPERM],
  ['execveat', 322, EPERM],
  ['userfaultfd', 323, EPERM],
  ['io_uring_setup', 425, ENOSYS],
  ['io_uring_enter', 426, ENOSYS],
  ['io_uring_register', 427, ENOSYS],
  ['open_tree', 428, EPERM],
  ['move_mount', 429, EPERM],
  ['fsopen', 430, EPERM],
  ['fsconfig', 431, EPERM],
  ['fsmount', 432, EPERM],
  ['fspick', 433, EPERM],
  ['clone3', 435, ENOSYS],
  ['mount_setattr', 442, EPERM],
  ['quotactl_fd', 443, EPERM],
  ['landlock_create_ruleset', 444, ENOSYS],
  ['landlock_add_rule', 445, ENOSYS],
  ['landlock_restrict_self', 446, ENOSYS],
  ['memfd_secret', 447, ENOSYS],
  ['set_mempolicy_home_node', 450, EPERM]
]);

let cachedX64Filter;

function linuxSeccompSupported() {
  return process.platform === 'linux' && process.arch === 'x64';
}

function createLinuxSeccompPolicy() {
  if (!linuxSeccompSupported()) {
    return null;
  }
  return {
    arch: 'x64',
    fd: LINUX_SECCOMP_FILTER_FD,
    filter: createLinuxX64SeccompFilter(),
    deniedSyscalls: X64_DENIED_SYSCALLS.map(([name]) => name)
  };
}

function createLinuxX64SeccompFilter() {
  if (!cachedX64Filter) {
    cachedX64Filter = compileX64DenyPolicy(X64_DENIED_SYSCALLS);
  }
  return Buffer.from(cachedX64Filter);
}

function compileX64DenyPolicy(deniedSyscalls) {
  const instructions = [
    stmt(BPF_LD | BPF_W | BPF_ABS, SECCOMP_DATA_ARCH_OFFSET),
    jump(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    stmt(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    stmt(BPF_LD | BPF_W | BPF_ABS, SECCOMP_DATA_NR_OFFSET),
    jump(BPF_JMP | BPF_JGE | BPF_K, X32_SYSCALL_BIT, 0, 1),
    stmt(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM)
  ];

  for (const [, syscallNumber, errno] of deniedSyscalls) {
    instructions.push(
      jump(BPF_JMP | BPF_JEQ | BPF_K, syscallNumber, 0, 1),
      stmt(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | errno)
    );
  }
  instructions.push(stmt(BPF_RET | BPF_K, SECCOMP_RET_ALLOW));

  const buffer = Buffer.alloc(instructions.length * 8);
  instructions.forEach((instruction, index) => {
    const offset = index * 8;
    buffer.writeUInt16LE(instruction.code, offset);
    buffer.writeUInt8(instruction.jt, offset + 2);
    buffer.writeUInt8(instruction.jf, offset + 3);
    buffer.writeUInt32LE(instruction.k >>> 0, offset + 4);
  });
  return buffer;
}

function stmt(code, k) {
  return { code, jt: 0, jf: 0, k };
}

function jump(code, k, jt, jf) {
  return { code, jt, jf, k };
}

function prepareSeccompStdio(launch, baseStdio) {
  const stdio = baseStdio.slice();
  const policy = launch?.seccompPolicy;
  if (!policy?.filter) {
    return { stdio, cleanup() {} };
  }

  const fd = openSeccompFilterFd(policy.filter);
  while (stdio.length <= policy.fd) {
    stdio.push('ignore');
  }
  stdio[policy.fd] = fd;
  return {
    stdio,
    cleanup() {
      try {
        fs.closeSync(fd);
      } catch {
        // The child already inherited the descriptor; cleanup is best effort.
      }
    }
  };
}

function openSeccompFilterFd(filter) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-seccomp-'));
  const filePath = path.join(directory, 'policy.bpf');
  try {
    fs.writeFileSync(filePath, filter, { mode: 0o600 });
    const fd = fs.openSync(filePath, 'r');
    fs.rmSync(directory, { recursive: true, force: true });
    return fd;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  LINUX_SECCOMP_FILTER_FD,
  X64_DENIED_SYSCALLS,
  createLinuxSeccompPolicy,
  createLinuxX64SeccompFilter,
  linuxSeccompSupported,
  prepareSeccompStdio
};

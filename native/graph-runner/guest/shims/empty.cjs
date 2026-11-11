// Shim for a barrel or Node builtin that the guest imports but never reads
// at load time. A node that calls into it at run time fails with a
// TypeError, which the kernel reports as a node error.
module.exports = {};

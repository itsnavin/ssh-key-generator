'use strict';

// sshpk's unencrypted serializer needs only check integers, not Node's crypto stack.
module.exports = { randomBytes: require('randombytes') };

// @flow

import { tcrypto, utils, type Key } from '@tanker/crypto';

import { isKeyPublishToDevice, isKeyPublishToUser, isKeyPublishToUserGroup } from '../Blocks/payloads';
import GroupStore from '../Groups/GroupStore';
import Keystore from '../Session/Keystore';
import UserAccessor from '../Users/UserAccessor';
import { type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';

export class KeyDecryptor {
  _keystore: Keystore;
  _userAccessor: UserAccessor;
  _groupStore: GroupStore;

  constructor(
    keystore: Keystore,
    userAccessor: UserAccessor,
    groupStore: GroupStore
  ) {
    this._keystore = keystore;
    this._userAccessor = userAccessor;
    this._groupStore = groupStore;
  }

  async decryptResourceKeyPublishedToDevice(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    if (!this._keystore.deviceId || !utils.equalArray(keyPublishEntry.recipient, this._keystore.deviceId)) {
      return null;
    }
    const authorKey = await this._userAccessor.getDevicePublicEncryptionKey(keyPublishEntry.author);
    if (!authorKey)
      throw new Error('Assertion error: Key publish is verified, but can\'t find author\'s key!');
    return tcrypto.asymDecrypt(keyPublishEntry.key, authorKey, this._keystore.privateEncryptionKey);
  }

  async decryptResourceKeyPublishedToUser(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    const userKey = this._keystore.findUserKey(keyPublishEntry.recipient);
    if (!userKey)
      return null;
    return tcrypto.sealDecrypt(keyPublishEntry.key, userKey);
  }

  async decryptResourceKeyPublishedToGroup(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    const group = await this._groupStore.findFull({ groupPublicEncryptionKey: keyPublishEntry.recipient });
    if (!group)
      return null;
    return tcrypto.sealDecrypt(keyPublishEntry.key, group.encryptionKeyPair);
  }

  async keyFromKeyPublish(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    let resourceKey: Promise<?Key>;

    if (isKeyPublishToDevice(keyPublishEntry.nature)) {
      resourceKey = this.decryptResourceKeyPublishedToDevice(keyPublishEntry);
    } else if (isKeyPublishToUser(keyPublishEntry.nature)) {
      resourceKey = this.decryptResourceKeyPublishedToUser(keyPublishEntry);
    } else if (isKeyPublishToUserGroup(keyPublishEntry.nature)) {
      resourceKey = this.decryptResourceKeyPublishedToGroup(keyPublishEntry);
    } else {
      resourceKey = Promise.resolve(null);
    }
    return resourceKey;
  }

  deviceReady(): bool {
    return !!this._keystore.deviceId;
  }
}
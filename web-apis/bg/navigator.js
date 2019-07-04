const globals = require('../../globals')
const assert = require('assert')
const { UserDeniedError } = require('beaker-error-constants')
const dat = require('../../dat')
const appPerms = require('../../lib/app-perms')
const knex = require('../../lib/knex')
const db = require('../../dbs/profile-data-db')
const sitedataDb = require('../../dbs/sitedata')

// typedefs
// =

/**
 * @typedef {import('../../users').User} User
 *
 * @typedef {Object} ApplicationPermission
 * @prop {string} id
 * @prop {string[]} caps
 * @prop {string} description
 *
 * @typedef {Object} ApplicationState
 * @prop {string} url
 * @prop {string} title
 * @prop {string} description
 * @prop {ApplicationPermission[]} permissions
 * @prop {boolean} installed
 * @prop {boolean} enabled
 * @prop {string} installedAt
 */

// exported api
// =

module.exports = {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.title]
   * @param {string} [opts.buttonLabel]
   * @param {string} [opts.archive]
   * @param {string} [opts.defaultPath]
   * @param {string[]} [opts.select]
   * @param {Object} [opts.filters]
   * @param {string[]} [opts.filters.extensions]
   * @param {boolean} [opts.filters.writable]
   * @param {boolean} [opts.filters.networked]
   * @param {boolean} [opts.allowMultiple]
   * @param {boolean} [opts.disallowCreate]
   * @returns {Promise<string[]>}
   */
  async beakerSelectFileDialog (opts = {}) {
    var userSession = globals.userSessionAPI.getFor(this.sender)
    if (!userSession) throw new Error('No active user session')

    // validate
    assert(opts && typeof opts === 'object', 'Must pass an options object')
    assert(!opts.title || typeof opts.title === 'string', '.title must be a string')
    assert(!opts.buttonLabel || typeof opts.buttonLabel === 'string', '.buttonLabel must be a string')
    assert(!opts.archive || typeof opts.archive === 'string', '.archive must be a string')
    assert(!opts.defaultPath || typeof opts.defaultPath === 'string', '.defaultPath must be a string')
    assert(!opts.select || isStrArray(opts.select), '.select must be an array of strings')
    if (opts.filters) {
      assert(typeof opts.filters === 'object', '.filters must be an object')
      assert(!opts.filters.extensions || isStrArray(opts.filters.extensions), '.filters.extensions must be an array of strings')
      assert(!opts.filters.writable || typeof opts.filters.writable === 'boolean', '.filters.writable must be a boolean')
      assert(!opts.filters.networked || typeof opts.filters.networked === 'boolean', '.filters.networked must be a boolean')
    }
    assert(!opts.allowMultiple || typeof opts.allowMultiple === 'boolean', '.filters.allowMultiple must be a boolean')
    assert(!opts.disallowCreate || typeof opts.disallowCreate === 'boolean', '.filters.disallowCreate must be a boolean')

    // set defaults
    if (!opts.archive) {
      opts.archive = userSession.url
    }

    // initiate the modal
    var res
    try {
      res = await globals.uiAPI.showModal(this.sender, 'select-file', opts)
    } catch (e) {
      if (e.name !== 'Error') {
        throw e // only rethrow if a specific error
      }
    }
    if (!res || !res.paths) throw new UserDeniedError()
    return res.paths
  },
  /**
   * @param {Object} [opts]
   * @param {string} [opts.title]
   * @param {string} [opts.buttonLabel]
   * @param {string} [opts.archive]
   * @param {string} [opts.defaultPath]
   * @param {string} [opts.defaultFilename]
   * @param {string} [opts.extension]
   * @param {Object} [opts.filters]
   * @param {string[]} [opts.filters.extensions]
   * @param {boolean} [opts.filters.networked]
   * @returns {Promise<string[]>}
   */
  async beakerSaveFileDialog (opts = {}) {
    var userSession = globals.userSessionAPI.getFor(this.sender)
    if (!userSession) throw new Error('No active user session')

    // validate
    assert(opts && typeof opts === 'object', 'Must pass an options object')
    assert(!opts.title || typeof opts.title === 'string', '.title must be a string')
    assert(!opts.buttonLabel || typeof opts.buttonLabel === 'string', '.buttonLabel must be a string')
    assert(!opts.archive || typeof opts.archive === 'string', '.archive must be a string')
    assert(!opts.defaultPath || typeof opts.defaultPath === 'string', '.defaultPath must be a string')
    assert(!opts.defaultFilename || typeof opts.defaultFilename === 'string', '.defaultFilename must be a string')
    if (opts.filters) {
      assert(typeof opts.filters === 'object', '.filters must be an object')
      assert(!opts.filters.extensions || isStrArray(opts.filters.extensions), '.filters.extensions must be an array of strings')
      assert(!opts.filters.networked || typeof opts.filters.networked === 'boolean', '.filters.networked must be a boolean')
    }

    // set defaults
    if (!opts.archive) {
      opts.archive = userSession.url
    }

    // initiate the modal
    opts.saveMode = true
    var res
    try {
      res = await globals.uiAPI.showModal(this.sender, 'select-file', opts)
    } catch (e) {
      if (e.name !== 'Error') {
        throw e // only rethrow if a specific error
      }
    }
    if (!res || !res.path) throw new UserDeniedError()
    return res.path
  },

  /**
   * @param {Object} [opts]
   * @param {string} [opts.title]
   * @param {string} [opts.buttonLabel]
   * @param {Object} [opts.filters]
   * @param {boolean} [opts.filters.writable]
   * @param {string} [opts.filters.type]
   * @returns {Promise<string[]>}
   */
  async beakerSelectDatArchiveDialog (opts = {}) {
    // validate
    assert(opts && typeof opts === 'object', 'Must pass an options object')
    assert(!opts.title || typeof opts.title === 'string', '.title must be a string')
    assert(!opts.buttonLabel || typeof opts.buttonLabel === 'string', '.buttonLabel must be a string')
    if (opts.filters) {
      assert(typeof opts.filters === 'object', '.filters must be an object')
      assert(!opts.filters.type || typeof opts.filters.type === 'string', '.filters.type must be a string')
      assert(!opts.filters.writable || typeof opts.filters.writable === 'boolean', '.filters.writable must be a boolean')
    }

    // initiate the modal
    var res
    try {
      res = await globals.uiAPI.showModal(this.sender, 'select-archive', opts)
    } catch (e) {
      if (e.name !== 'Error') {
        throw e // only rethrow if a specific error
      }
    }
    if (!res || !res.url) throw new UserDeniedError()
    return res.url
  },

  /**
   * @returns {Promise<ApplicationState>}
   */
  async getApplicationState () {
    var url = await appPerms.toDatOrigin(this.sender.getURL())
    var userId = await appPerms.getSessionUserId(this.sender)
    var archiveInfo = await dat.library.getArchiveInfo(url)
    var record = await db.get(knex('installed_applications').where({userId, url}))
    if (record) {
      record.installed = true
    } else {
      record = {
        url,
        installed: false,
        enabled: false,
        installedAt: null
      }
    }
    record.title = archiveInfo.title
    record.description = archiveInfo.description
    record.permissions = await sitedataDb.getAppPermissions(record.url)
    return massageAppRecord(record)
  }
}

function isStrArray (v) {
  return (Array.isArray(v) && v.every(el => typeof el === 'string'))
}

/**
 * @param {Object} record
 * @returns {ApplicationState}
 */
function massageAppRecord (record) {
  return {
    url: record.url,
    title: record.title,
    description: record.description,
    permissions: Object.entries(record.permissions).map(([id, caps]) => ({
      id,
      caps,
      description: appPerms.describePerm(id, caps)
    })),
    installed: record.installed,
    enabled: Boolean(record.enabled),
    installedAt: record.createdAt ? (new Date(record.createdAt)).toISOString() : null
  }
}
const globals = require('../../globals')
const assert = require('assert')
const {URL} = require('url')
const dat = require('../../dat')
const statusesAPI = require('../../uwg/statuses')
const sessionPerms = require('../../lib/session-perms')

// typedefs
// =

/**
 * @typedef {Object} StatusAuthorPublicAPIRecord
 * @prop {string} url
 * @prop {string} title
 * @prop {string} description
 * @prop {string[]} type
 * @prop {boolean} isOwner
 *
 * @typedef {Object} StatusPublicAPIRecord
 * @prop {string} url
 * @prop {string} body
 * @prop {string} createdAt
 * @prop {string} updatedAt
 * @prop {StatusAuthorPublicAPIRecord} author
 * @prop {string} visibility
 */

// exported api
// =

module.exports = {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.filters]
   * @param {string|string[]} [opts.filters.authors]
   * @param {string} [opts.filters.visibility]
   * @param {string} [opts.sortBy]
   * @param {number} [opts.offset=0]
   * @param {number} [opts.limit]
   * @param {boolean} [opts.reverse]
   * @returns {Promise<StatusPublicAPIRecord[]>}
   */
  async list (opts) {
    await sessionPerms.assertCan(this.sender, 'unwalled.garden/api/statuses', 'read')
    opts = (opts && typeof opts === 'object') ? opts : {}
    if (opts && 'sortBy' in opts) assert(typeof opts.sortBy === 'string', 'SortBy must be a string')
    if (opts && 'offset' in opts) assert(typeof opts.offset === 'number', 'Offset must be a number')
    if (opts && 'limit' in opts) assert(typeof opts.limit === 'number', 'Limit must be a number')
    if (opts && 'reverse' in opts) assert(typeof opts.reverse === 'boolean', 'Reverse must be a boolean')
    if (opts && opts.filters) {
      if ('authors' in opts.filters) {
        if (Array.isArray(opts.filters.authors)) {
          assert(opts.filters.authors.every(v => typeof v === 'string'), 'Authors filter must be a string or array of strings')
        } else {
          assert(typeof opts.filters.authors === 'string', 'Authors filter must be a string or array of strings')
        }
      }
      if ('visibility' in opts.filters) {
        assert(typeof opts.filters.visibility === 'string', 'Visibility filter must be a string')
      }
    }
    var statuses = await statusesAPI.list(opts)
    return Promise.all(statuses.map(massageStatusRecord))
  },

  /**
   * @param {string} url
   * @returns {Promise<StatusPublicAPIRecord>}
   */
  async get (url) {
    await sessionPerms.assertCan(this.sender, 'unwalled.garden/api/statuses', 'read')
    return massageStatusRecord(await statusesAPI.get(url))
  },

  /**
   * @param {Object|string} status
   * @param {string} status.body
   * @param {string} [status.visibility]
   * @returns {Promise<StatusPublicAPIRecord>}
   */
  async add (status) {
    await sessionPerms.assertCan(this.sender, 'unwalled.garden/api/statuses', 'write')
    var userArchive = await sessionPerms.getSessionUserArchive(this.sender)

    // string usage
    if (typeof status === 'string') {
      status = {body: status}
    }

    assert(status && typeof status === 'object', 'The `status` parameter must be a string or object')
    assert(status.body && typeof status.body === 'string', 'The `status.body` parameter must be a non-empty string')
    if ('visibility' in status) assert(typeof status.visibility === 'string', 'The `status.visibility` parameter must be "public" or "private"')

    // default values
    if (!status.visibility) {
      status.visibility = 'public'
    }

    var url = await statusesAPI.add(userArchive, status)
    return massageStatusRecord(await statusesAPI.get(url))
  },

  /**
   * @param {string} url
   * @param {Object|string} status
   * @param {string} status.body
   * @param {string} [status.visibility]
   * @returns {Promise<StatusPublicAPIRecord>}
   */
  async edit (url, status) {
    await sessionPerms.assertCan(this.sender, 'unwalled.garden/api/statuses', 'write')
    var userArchive = await sessionPerms.getSessionUserArchive(this.sender)

    // string usage
    if (typeof status === 'string') {
      status = {body: status}
    }

    assert(url && typeof url === 'string', 'The `url` parameter must be a valid URL')
    assert(status && typeof status === 'object', 'The `status` parameter must be a string or object')
    if ('body' in status) assert(typeof status.body === 'string', 'The `status.body` parameter must be a non-empty string')
    if ('visibility' in status) assert(typeof status.visibility === 'string', 'The `status.visibility` parameter must be "public" or "private"')

    var filepath = await urlToFilepath(url, userArchive.url)
    await statusesAPI.edit(userArchive, filepath, status)
    return massageStatusRecord(await statusesAPI.get(userArchive.url + filepath))
  },

  /**
   * @param {string} url
   * @returns {Promise<void>}
   */
  async remove (url) {
    await sessionPerms.assertCan(this.sender, 'unwalled.garden/api/statuses', 'write')
    var userArchive = await sessionPerms.getSessionUserArchive(this.sender)

    assert(url && typeof url === 'string', 'The `url` parameter must be a valid URL')

    var filepath = await urlToFilepath(url, userArchive.url)
    await statusesAPI.remove(userArchive, filepath)
  }
}

// internal methods
// =

/**
 * Tries to parse the URL and return the pathname. If fails, assumes the string was a pathname.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function urlToFilepath (url, origin) {
  var urlp
  var filepath
  try {
    // if `url` is a full URL, extract the path
    urlp = new URL(url)
    filepath = urlp.pathname
  } catch (e) {
    // assume `url` is a path
    return url
  }

  // double-check the origin
  var key = await dat.dns.resolveName(urlp.hostname)
  var urlp2 = new URL(origin)
  if (key !== urlp2.hostname) {
    throw new Error('Unable to edit statuses on other sites than your own')
  }

  return filepath
}

/**
 * @param {Object} status
 * @returns {StatusPublicAPIRecord}
 */
function massageStatusRecord (status) {
  if (!status) return null
  var url =  status.author.url + status.pathname
  return {
    url,
    body: status.body,
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
    author: {
      url: status.author.url,
      title: status.author.title,
      description: status.author.description,
      type: status.author.type
    },
    visibility: status.visibility
  }
}
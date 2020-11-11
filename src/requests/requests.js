const axios = require('axios')
const qs = require('querystring')
const FormData = require('form-data')
const fs = require('fs')
const CircularJSON = require('circular-json')

const { sleep, to } = require('../utils')

const baseUrl = 'https://testenv.my-product.com'
const defaultHeaders = {
    'Referer': baseUrl + '/',
    'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:66.0) Gecko/20100101 Firefox/66.0',
    'Accept': 'application/json, text/plain, */*'
}

let terminate = false

const injectLog = function(context, log) {
    if (context.emitter) {
        context.emitter.emit('log', context.log(`${log}`))
    }
    else {
        console.log(log)
    }
}

const login = async function(account, password) {

    if (typeof login.account == 'undefined') {
        login.account = account
    }
    if (typeof login.password == 'undefined') {
        login.password = password
    }

    return new Promise( async (resolve, reject) => {

        const regexForCookie = /(?<key>[^=]+)=(?<value>[^\;]*);?\s?/g

        let url = baseUrl + '/login'

        let headers = {
            ... defaultHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
        }

        let body = {
            'account': login.account,
            'password': login.password
        }

        let success = false
        while(!success) {

            const [err, res] = await to(axios({
                method: 'post',
                url: url,
                data: qs.stringify(body),
                headers: headers
            }))

            if (err) { injectLog(this, `login error: ${err}`) }
            else {
                injectLog(this, res.headers['set-cookie'])
                let parsedCookie = {}
                for (let str of res.headers['set-cookie']) {
                    let matched = str.matchAll(regexForCookie)
                    for (let m of matched) {
                        let { key, value } = m.groups
                        parsedCookie[key] = value
                    }
                }
                let cookieToBeUsed = ''
                cookieToBeUsed += 't=' + parsedCookie['t'] + '; '
                cookieToBeUsed += 'v=' + parsedCookie['v'] + '; '
                cookieToBeUsed += 'SESSION=' + parsedCookie['SESSION'] + '; '
                await sleep(2000)
                resolve({
                    cookie: cookieToBeUsed
                })
                success = true
            }

            await sleep(2000)

        }

    })
}

const getInfo = async function(cookie) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/info'

        let headers = {
            ... defaultHeaders,
            'cookie': cookie
        }

        let success = false
        while(!success) {

            const [err, res] = await to(axios({
                method: 'get',
                url: url,
                headers: headers
            }))
        
            if (err) {
                injectLog(this, `get info error: ${err}`)
                let loginRes = await login()
                cookie = loginRes.cookie
                injectLog(this, `relogin and get cookie: ${cookie}`)
            }
            else { 
                await sleep(2000)
                resolve({
                    cookie: cookie
                })
                success = true
            }

            await sleep(2000)

        }

    })
}

const upload = async function(cookie, filename) {
    return new Promise( async (resolve, reject) => {

        // step 1: upload file
        let url = baseUrl + '/upload'

        const form = new FormData()
        form.append('file', fs.createReadStream(__dirname + '/files/' + filename))

        let headers = form.getHeaders()
        headers = {
            ... headers,
            ... defaultHeaders,
            cookie: cookie
        }

        const [err, res] = await to(axios({
            method: 'post',
            url: url,
            data: form,
            headers: headers
        }))

        let handle = ''
        if (err) { reject(err) }
        else if (res.data.result !== 'SUCCESS') { reject(res.data) }
        else { handle = res.data.data.workspaceId }

        // step 2: check status

        url = baseUrl + '/preprocesscheck'

        headers = {  
            ... defaultHeaders
        }

        let params = { handle: handle }

        let tempResult = {}
        let status = 2        
        while (status === 2 && !terminate) {

            await sleep(2000)

            const [err, res] = await to(axios({
                method: 'get',
                url: url,
                params: params,
                headers: headers
            }))

            // ignore any error, keep polling
            if (err) { 
                injectLog(this, `preprocess check error: ${err}`)
            }
            else if (res && res.hasOwnProperty('data') && res.data.hasOwnProperty('status')) {
                status = res.data.status
                injectLog(this, `preprocess check status = ${status}`)
                tempResult = res
            }
        }

        if (status !== 0) {
            reject(CircularJSON.stringify(tempResult))
        }
        else {
            await sleep(2000)
            resolve({
                handle: handle
            })
        }

    })
}

const checkPrivilege = async function(cookie) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/privilege'

        let headers = {
            ... defaultHeaders,
            'cookie': cookie
        }

        headers['cookie'] = cookie
        const [err, res] = await to(axios({
            method: 'post',
            url: url,
            headers: headers
        }))

        if (err) { reject(err) }
        else { 
            await sleep(2000)
            resolve()
        }

    })
}

const verifyHandle = async function(cookie, handle) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/verify'

        let headers = {
            ... defaultHeaders,
            'cookie': cookie,
            'handle': handle
        }

        let success = false
        while(!success) {

            headers['cookie'] = cookie
            const [err, res] = await to(axios({
                method: 'post',
                url: url,
                headers: headers
            }))

            if (err) {
                injectLog(this, `verify handle error: ${err}`)
                let loginRes = await login()
                cookie = loginRes.cookie
                injectLog(this, `relogin and get cookie: ${cookie}`)
            }
            else if (res.data.status !== 'success') { reject(CircularJSON.stringify(res.data)) }
            else { 
                await sleep(2000)
                resolve({
                    cookie: cookie
                })
                success = true
            }

            await sleep(2000)
        }

    })
}

const getSetting = async function(cookie, handle) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/setting'

        let headers = {
            ... defaultHeaders,
            'cookie': cookie,
            'handle': handle
        }

        const [err, res] = await to(axios({
            method: 'get',
            url: url,
            headers: headers
        }))

        if (err) { reject(err) }
        else if (res.data.status !== 'success') { reject(CircularJSON.stringify(res.data)) }
        else { 
            await sleep(2000)
            resolve() 
        }

    })
}

const enablePostProcess = async function(cookie, handle) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/enable'

        let headers = {
            ... defaultHeaders,
            'cookie': cookie,
            'handle': handle
        }

        let success = false
        while(!success) {

            headers['cookie'] = cookie
            const [err, res] = await to(axios({
                method: 'post',
                url: url,
                headers: headers
            }))

            if (err) {
                injectLog(this, `enable error: ${err}`)
                let loginRes = await login()
                cookie = loginRes.cookie
                injectLog(this, `relogin and get cookie: ${cookie}`)
            }
            else if (res.data.status !== 'success') { reject(CircularJSON.stringify(res.data)) }
            else { 
                await sleep(2000)
                resolve({
                    cookie: cookie
                })
                success = true
            }

            await sleep(2000)
        }

    })
}

const process1 = async function(cookie, handle) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/complex_process1'

        let headers = {
            ... defaultHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'cookie': cookie,
            'handle': handle
        }

        let data = { rule: 1 }

        let tempResult = {}
        let progress = 0
        while (progress === 0) {

            await sleep(2000)

            headers['cookie'] = cookie
            const [err, res] = await to(axios({
                method: 'post',
                data: data,
                url: url,
                headers: headers
            }))

            if (err) {
                injectLog(this, `process 1 error: ${err}`)
                let loginRes = await login()
                cookie = loginRes.cookie
                injectLog(this, `relogin and get cookie: ${cookie}`)
            }
            else if (res && res.hasOwnProperty('data') && res.data.hasOwnProperty('progress')) {
                progress = res.data.progress
                injectLog(this, `process 1 progress = ${progress}`)
            }

            tempResult = res
        }

        //if (progress !== 1) reject(CircularJSON.stringify(tempResult.data))

        await sleep(2000)
        resolve({
            cookie: cookie
        })
    })
}

const process2 = async function(cookie, handle) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/complex_process2'

        let headers = {
            ... defaultHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'cookie': cookie,
            'handle': handle
        }

        let data = { rule: 2 }

        let tempResult = {}
        let progress = 0
        while (progress === 0) {

            await sleep(2000)

            headers['cookie'] = cookie
            const [err, res] = await to(axios({
                method: 'post',
                data: data,
                url: url,
                headers: headers
            }))

            if (err) {
                injectLog(this, `process 2 error: ${err}`)
                let loginRes = await login()
                cookie = loginRes.cookie
                injectLog(this, `relogin and get cookie: ${cookie}`)
            }
            else if (res && res.hasOwnProperty('data') && res.data.hasOwnProperty('progress')) {
                progress = res.data.progress
                injectLog(this, `process 2 progress = ${progress}`)
            }

            tempResult = res
        }

        //if (progress !== 1) reject(CircularJSON.stringify(tempResult.data))

        await sleep(2000)
        resolve({
            cookie: cookie
        })
    })
}

const process3 = async function(cookie, handle) {
    return new Promise( async (resolve, reject) => {

        let url = baseUrl + '/complex_process3'

        let headers = {
            ... defaultHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'cookie': cookie,
            'handle': handle
        }

        let data = { rule: 3 }

        let tempResult = {}
        let progress = 0
        while (progress === 0) {

            await sleep(2000)

            headers['cookie'] = cookie
            const [err, res] = await to(axios({
                method: 'post',
                data: data,
                url: url,
                headers: headers
            }))

            if (err) {
                injectLog(this, `process 3 error: ${err}`)
                let loginRes = await login()
                cookie = loginRes.cookie
                injectLog(this, `relogin and get cookie: ${cookie}`)
            }
            else if (res && res.hasOwnProperty('data') && res.data.hasOwnProperty('progress')) {
                progress = res.data.progress
                injectLog(this, `process 3 progress = ${progress}`)
            }

            tempResult = res
        }

        //if (progress !== 1) reject(CircularJSON.stringify(tempResult.data))

        await sleep(2000)
        resolve({
            cookie: cookie
        })
    })
}

module.exports = {
    login: login,
    getInfo: getInfo,
    upload: upload,
    checkPrivilege: checkPrivilege,
    verifyHandle: verifyHandle,
    getSetting: getSetting,
    enablePostProcess: enablePostProcess,
    process1: process1,
    process2: process2,
    process3: process3
}

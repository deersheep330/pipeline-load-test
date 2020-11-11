const process = require('process')
const { FunctionPipeline, OnError } = require('@deersheep330/function-pipeline')
const { 
    login,
    getInfo,
    upload,
    checkPrivilege,
    enablePostProcess,
    process1,
    process2,
    process3
} = require('../requests')
const { sleep } = require('../utils')

const args = process.argv.slice(2)
const workerNum = args[0]
const account = args[1]
const password = args[2]
const filename = args[3]
const runtime = args[4]

const work = async () => {

    const startTime = Date.now()

    let initialVariables = {
        account: account,
        password: password,
        filename: filename
    }

    let pipeline = new FunctionPipeline(id=`worker-${workerNum}`, initialVariables=initialVariables)

    pipeline.emitter.on('log', function(data) {
        console.log(`\x1b[1m${data}\x1b[0m`)
        process.send({
            type: 'log',
            data: data
        })
    })
    pipeline.emitter.on('record', function(data) {
        //console.log(`\x1b[44m${JSON.stringify(data)}\x1b[0m`)
        const str = JSON.stringify(data)
        if (str.includes('upload') || str.includes('VH')) {
            process.send({
                type: 'record',
                data: data
            })
        }
    })
    pipeline.emitter.on('err', function(data) {
        console.log(`\x1b[41m${data}\x1b[0m`)
        process.send({
            type: 'error',
            data: data
        })
    })

    // build the pipeline and run it
    pipeline.add(OnError.RETRY, login)
            .add(OnError.RETRY, getInfo)
            .add(OnError.RETRY, upload)
            .add(OnError.START_OVER, checkPrivilege)
            .add(OnError.RETRY, enablePostProcess)
            .add(OnError.CONTINUE, process1, process2, process3)
    
    while(Date.now() - startTime < runtime) {
        await pipeline.perform()
        await sleep(2000)
    }

}

(async () => {
    await work()
    process.exit(0)
})()
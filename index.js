console.log('\\o/ welcome to poor mans cancelable fetch');

const extractFnBody = (fn) => (
  fn
    .toString()
    .match(/^\([^)]*\)\s*=>\s*{([\w\W]*?)}$/)[1]
)

const tap = (val) => (
  console.log(val),
  val
)

const fn2blobUrl = (fn, ...inject) => window.URL.createObjectURL(new Blob([
  inject.map(fn => fn.toString()).join('\n') +
  extractFnBody(fn)
]))

function transferHeaders(headers, post = () => {}) {
  let transfer;

  if (headers instanceof Headers) {
    transfer = {};

    for (key of headers.keys()) {
      transfer[key] = headers.get(key);
    }
  } else {
    transfer = headers;
  }

  post(transfer);

  return transfer;
}

function receiveHeaders(headers = {}) {
  return new Headers(headers);
}

const transferBody = (worker, body) => new Promise((resolve, reject) => {
  if (body instanceof Blob) {
    console.log('parsing blob');
    const reader = new FileReader();

    reader.onload = function () {
      console.log('reader onload');
      const transfer = this.result;

      worker.postMessage({
        topic: 'args:init',
        name: 'body',
        value: transfer,
      }, [transfer])

      resolve();
    }

    reader.readAsArrayBuffer(body);
    reader.onerror = reject;
  }

  //if (body instanceof BufferSource) {
    //worker.postMesssage({
      //topic: 'args:init',
      //name: 'body',
      //value: body,
    //}, [body]);

    //resolve();

    //return;
  //}

  // TODO
  //https://developer.mozilla.org/en-US/docs/Web/API/FormData
  //https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
  //https://developer.mozilla.org/en-US/docs/Web/API/USVString
})

const fetchWorkerContents = fn2blobUrl(() => {
  const args = {
    url: '',
    init: {}
  };

  function receiveInitArg(name, value) {
    if (name === 'headers') {
      return receiveHeaders(value);
    }

    console.log('received init arg', name, value);

    return value;
  }

  onmessage = (event) => {
    //console.log('event', event.data);

    switch (event.data.topic) {
      case 'args:url':
        args.url = event.data.url;
        break;
      case 'args:init':
        args.init[event.data.name] = receiveInitArg(event.data.name, event.data.value);
        break;
      case 'request':
        let res;
        self.fetch(args.url, args.init)
          .then((r) => (res = r, res.arrayBuffer()))
          .then((buffer)=> {
            //console.log('sending back response from worker');
            self.postMessage(
              {
                topic: 'response',
                buffer,
                headers: transferHeaders(res.headers),
                status: res.status,
                statusText: res.statusText,
              },
              [buffer]
            );
          });
        break;
      case 'cancel':
        self.close();
        break;
      default:
    }

  }
}, transferHeaders, receiveHeaders);

const transferInitArg = ({worker, name, value}) => new Promise((resolve, reject) => {
  if (name === 'headers') {
    transferHeaders(value, (result) => worker.postMessage({
      topic: 'args:init',
      name: name,
      value: result
    }));

    resolve();
    return;
  }

  if (name === 'body') {
    resolve(transferBody(worker, value));
    return;
  }

  worker.postMessage({
    topic: 'args:init',
    name: name,
    value: value,
  });

  resolve();
})

const filterInitKey = (key) => (
  key !== 'controller'
);

function cancelableFetch(url, init = {}) {
  const worker = new Worker(fetchWorkerContents);

  if (init.controller) {
    init.controller.abort = () => worker.postMessage({ topic: 'cancel' })
  }

  return new Promise((resolve, reject) => {
    worker.postMessage({
      topic: 'args:url',
      url: url
    });

    worker.addEventListener('message', (msg) => {
      //console.log('msg from worker', msg);
      if (msg.data.topic === 'response') {
        //console.log('received response from worker');
        //TODO init settings headers/status/so-on
        resolve(new Response(
          msg.data.buffer,
          {
            headers: receiveHeaders(msg.data.headers),
            status: msg.data.status,
            statusText: msg.data.statusText
          }
        ));
      }
    });

    Promise.all(
      Object.keys(init).filter(filterInitKey).map((key) => transferInitArg({worker, name: key, value: init[key]}))
    ).then(
      () => worker.postMessage({ topic: 'request' }),
      err => console.error(err)
    );
  });
}

function FetchController () { }

const controller = new FetchController();

const $sendGet = document.getElementById('sendGet');
const $sendBlob = document.getElementById('sendBlob');
const $cancel = document.getElementById('cancel');

$sendGet.addEventListener('click', () => {
  cancelableFetch(window.location + 'slow', {
    headers: new Headers({
      foo: 'bar',
      Referer: window.location
    }),
    controller,
  })
    .then(res => res.text())
    .then(txt => console.log(txt));
});

$sendBlob.addEventListener('click', () => {
  const blob = new Blob(["This is my blob content"], {type : "text/plain"});

  cancelableFetch(window.location + 'blob', {
    body: blob,
    method: 'POST'
  })
    .then(res => res.text())
  console.log(blob);
});

$cancel.addEventListener('click', () => controller.abort());

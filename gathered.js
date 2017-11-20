var yaml = require('js-yaml'),
    request = require('request-promise'),
    errors = require('request-promise/errors'),
    cheerio = require('cheerio'),
    papa = require('papaparse'),
    prompt =  require('prompt'),
    fs = require('fs'),
    csvWriter = require('csv-write-stream'),
    colors = require('colors');

// making console logging more readable.
colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'cyan',
  prompt: 'grey',
  info: 'green',
  data: 'grey',
  help: 'cyan',
  warn: 'yellow',
  debug: 'blue',
  error: 'red'
});

var buildContent = {
  config : '',
  data : [],
  schema : {},
  urlStream : '',
  pageList : [],
  init : function() {
    // I don't like having all of this in callback functions but chaining
    // this seems needlessly complicated. Ideas??
    this.getUserInput();
    //Promise.all(main).then(this.writeContent());
  },
  getUserInput : function() {
    // grab the data we need to build this post type out.
    var inputs = {
      properties: {
        // would be _nice_ to make sure this exists and throw an error if not.
        // but this is a developer utility for a project at the moment.
        config: {
          description: "Please enter the path to your YAML file"
        }
      }
    };
    var that = this;
    prompt.start();
    prompt.get(inputs, function (err, inputs) {
        if (err) { return onErr(err); }

        // load file to a string. need to add error handling.
        that.schema = inputs;
        that.config = yaml.safeLoad(fs.readFileSync(inputs.config, 'utf8'));
        that.urlStream = fs.readFileSync(that.config.inputfile, 'utf-8');

        that.parsePages();

        return this;
    });
  },
  parsePages : function() {
    var that = this;

    papa.parse(this.urlStream, {
      header : true,
      preview : 0,
      skipEmptyLines : true,
      complete : function(results) {
        console.log(colors.verbose('Getting page URLs: %s items found.'), results.data.length);
        that.pageList = results.data;
        that.getPages();
    	},
      error: function(error,file) {
          var fn = arguments.callee;
          onErr(error, fn);
      }
    });

    return this;
  },
  getPages : function () {
    console.log('Accessing page contents. Please wait.'.verbose);
    // this has to use promises.
    var that = this;
    var requests = [];
    for(var i = 0, len = this.pageList.length; i < len; i++) {

      var row = this.pageList[i];

      // with no URL, we have no reason to be here.
      if ( !row.URL.length  || row.Notes == 'Dead link') {
        console.log(colors.error("Row failed to import: %s"), row.URL, row.Notes);
        continue;
      }

      var options = {
        uri: row.URL,
        row: row,
        resolveWithFullResponse: true,
        transform: function (body, response) {
          return {body : body, meta : response.request.row};
        }
      };
      requests.push(
        request(options)
        .then(function(data) {
          $ = cheerio.load(data.body);

          var content = $(that.config.content),
              head = $('head');

              // fields in this original declaration are not overridden
              // via the config.
              item = {
                postType : that.config.posttype,
                metaTitle : data.meta.Title,
                metaKeywords : head.find('meta[name="keywords"]').attr('content'),
                metaDesc : data.meta.Description,
                pubDate : data.meta.Date
              };

          // Starting with post fields. We can add to this list as needed.
          // There's a better way to build this, but this will work for now.
          var title = content.find(that.config.item.title).first().text(),
              byline = content.find(that.config.item.byline).first().text(),
              body = content.find(that.config.item.body).html();


          if (title) {
            item.title = that.scrub(title);
          }
          if (byline) {
            item.byline = that.scrub(byline);
          }
          if (body) {
            item.body = that.scrub(body);
          }

          that.data.push(item);
          console.log(title.verbose, 'found.');
        })
      )
    } // end loop.

    Promise.all(requests).then(function() {
      that.writeContent();
    })
    .catch(function(err) {
      console.log(colors.error("Promise request failed: %s"),err.message);
    });
  },
  writeContent : function () {
    var writer = csvWriter(
      { headers : Object.keys(this.data[0]) }
    ),
        filename = this.config.posttype + '-content.csv';
    writer.pipe(fs.createWriteStream(filename));
    // this can't be right... but it works.
    for(var i = 0, len = this.data.length; i < len; i++) {
      writer.write(this.data[i]);
    }
    writer.end();
    console.log(colors.info('File "%s" created successfully.'), filename);
  },
  scrub : function (content) {
    return content.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  }
};

function onErr(err,fn) {
  console.log('Error from',fn,":", err);
  return true;
}

buildContent.init();

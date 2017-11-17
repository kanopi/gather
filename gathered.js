var Promise = require('bluebird');

var yaml = require('js-yaml'),
    request = require('request-promise'),
    errors = require('request-promise/errors'),
    cheerio = require('cheerio'),
    papa = require('papaparse'),
    prompt =  require('prompt'),
    fs = require('fs'),
    csvWriter = require('csv-write-stream');

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
  getUserInput: function() {
    // get the CSV file path to parse from the user.
    var inputs = {
      properties: {
        // would be _nice_ to make sure this exists and throw an error if not.
        // but this is a developer utility for a project at the moment.
        filename: {
          description: "Please enter the file path"
        },
        type: {
          description: "Please enter the slug for the post type"
        },
        /*
        config: {
          description: "Please enter the path to your YAML file"
        }
        */
      }
    };
    var that = this;
    prompt.start();
    prompt.get(inputs, function (err, inputs) {
        if (err) { return onErr(err); }

        // load file to a string. need to add error handling.
        that.schema = inputs;

        if (that.config) {
          that.config = yaml.safeLoad(fs.readFileSync(inputs.config, 'utf8'));
        }
        var file = that.urlStream = fs.readFileSync(inputs.filename, 'utf-8');
        that.parsePages();

        return this;
    });
  },
  parsePages : function() {
    var that = this;

    papa.parse(this.urlStream, {
      header: true,
      complete: function(results) {
        if (results.errors.length) {
          onErr(results.errors);
        }
        console.log('Getting page URLs:',results.data.length,'items found.');
        that.pageList = results.data;
        that.getPages();
    	}
    });

    return this;
  },
  getPages : function () {
    console.log('Accessing page contents. Please wait.');
    // this has to use promises.
    var that = this;
    var requests = [];
    for(var i = 0, len = this.pageList.length; i < len; i++) {

      var row = this.pageList[i];

      // with no URL, we have no reason to be here.
      if ( !row.URL.length ) {
        continue;
      }

      var options = {
        uri: row.URL,
        rowMeta: row,
        transform: function(body) {
          return cheerio.load(body);
        }
      };
      requests.push(
        request(options)
        .then(function($) {
          // ideally we move this (and the file details) into some kind of
          // config so we can reuse this script and lose the prompt...

          // we need to find our row data again - cleanest way to grab some meta info.
          var content = $('#maincol'),
              item = {
                postType : that.schema.type,
                pubDate : options.rowMeta.pubDate,
                seoTitle : options.rowMeta.Title,
                seoDesc : options.rowMeta.Description,
              };

          var title = content.find('h1').first().text(),
              date = content.find('.author').first().text(),
              body = content.find('.blog-body').html();

          if (title) {
            item.title = that.scrub(title);
          }
          if (date) {
            item.byline = that.scrub(date);
          }
          if (body) {
            //item.body = body.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
            item.body = that.scrub(body);
          }
          that.data.push(item);
        })
      );
    } // end loop.

    Promise.all(requests).then(function() {
      that.writeContent();
    })
    .catch(function(e){throw e;});
  },
  writeContent : function () {
    var writer = csvWriter(
      { headers : Object.keys(this.data[0]) }
    ),
        filename = this.schema.type + '-content.csv';
    writer.pipe(fs.createWriteStream(filename));
    // this can't be right... but it works.
    for(var i = 0, len = this.data.length; i < len; i++) {
      writer.write(this.data[i]);
    }
    writer.end();
    console.log('File \'', filename, '\' created successfully.');
  },
  scrub : function (content) {
    return content.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  }
};

function onErr(err) {
  console.log('Error: ', err);
  return true;
}

buildContent.init();

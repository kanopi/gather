var Promise = require('bluebird');

var request = require('request-promise'),
    errors = require('request-promise/errors'),
    cheerio = require('cheerio'),
    papa = require('papaparse'),
    prompt =  require('prompt'),
    fs = require('fs'),
    csvWriter = require('csv-write-stream');

var buildContent = {
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
    var inputSchema = {
      properties: {
        // would be _nice_ to make sure this exists and throw an error if not.
        // but this is a developer utility for a project at the moment.
        filename: {
          description: "Please enter the file path"
        },
        type: {
          description: "Please enter the slug for the post type"
        }
      }
    };
    var that = this;
    prompt.start();
    prompt.get(inputSchema, function (err, inputSchema) {
        if (err) { return onErr(err); }

        // load file to a string. need to add error handling.
        that.schema = inputSchema;
        var file = fs.readFileSync(inputSchema.filename, 'UTF-8');
        that.urlStream = file;
        that.parsePages();
        // chainable
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
        var options = {
          uri: row.URL,
          transform: function(body) {
            return cheerio.load(body);
          }
        };
        requests.push(
          request(options)
          .then(function($) {
            // ideally we move this (and the file details) into some kind of
            // config so we can reuse this script and lose the prompt...
            var content = $('#maincol'),
                item = {
                  postType : that.schema.type,
                  seoTitle : row.Title,
                  seoDate : row.Date,
                  seoDesc : row.Description,
                };

            var title = content.find('h1').first().text(),
                date = content.find('.author').first().text(),
                body = content.find('.blog-body').html();

            if (title) {
              item.title = that.scrub(title);
            }
            if (date) {
              item.date = that.scrub(date);
            }
            if (body) {
              item.body = body.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
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
    var writer = csvWriter(),
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

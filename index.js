var AWS = require("aws-sdk"),
  gm = require('gm').subClass({ imageMagick: true }), // Enable ImageMagick integration.,
  util = require('util'),
  request = require('request'),
  config = require('config'),
  async = require('async'),
  fs = require("fs"),
  ffmpeg = require('ffmpeg');

//process.env.PATH = process.env.PATH + ":/var/task";
process.env.PATH = process.env.PATH + ':/tmp/'
process.env["FFMPEG_PATH"] = "/tmp/ffmpeg";

exports.handler = (event, context, callback) => {
  console.log("Event records : ", event.Records[0].s3.bucket, event.Records[0].s3.object);
  console.log("Source bucket : ", event.Records[0].s3.bucket.name);
  console.log("Source key : ", event.Records[0].s3.object.key);

  const extension = event.Records[0].s3.object.key.split('.').pop().toLowerCase();

  console.log("Extension :", extension);

  if (extension == "mp4" || extension == "avi" || extension == "flv" || extension == "mov" || extension == "wmv" || extension == "3gp" || extension == "mpg" || extension == "mpeg") {
    console.log("Calling video function");
    generatevideoThumnail(event, context, (err) => {
      if (err)
        console.log("Error :", err);
    });
  } else if (extension == "jpg" || extension == "jpeg" || extension == "png" || extension == "gif") {
    console.log("Calling Image function");
    generateImageThumnail(event, context);
  } else {
    callback("Invalid extension.");
  }
};

function generatevideoThumnail(event, context, callback) {
  console.log("Source bucket : ", event.Records[0].s3.bucket.name);
  console.log("Source key : ", event.Records[0].s3.object.key);

  var s3 = new AWS.S3();
  var sourceBucket = event.Records[0].s3.bucket.name;
  var objectKey = event.Records[0].s3.object.key;
  var destinationBucket = sourceBucket;
  var img_path = objectKey.split("/");
  // var sourceBucket = "video2019";
  // var destinationBucket = "video2019";
  // var objectKey = event.Records[0].s3.object.key;
  var getObjectParams = {
    Bucket: sourceBucket,
    Key: objectKey
  };
  s3.getObject(getObjectParams, function (err, data) {
    if (err) {
      console.log(err, err.stack);
      return callback(err);
    } else {
      console.log("Image Path : ", img_path);
      console.log("S3 object retrieval get successful.", data);
      var path_to_store_image = "/tmp";
      var image_file_name_w_ext = objectKey.split("/")[objectKey.split("/").length - 1].split('.').slice(0, -1).join('.');

      // var dstKey = "thumb/" + objectKey.split('.').slice(0, -1).join('.') + ".jpg";
      var fileType = objectKey.match(/\.\w+$/);
      var video_file_name = objectKey.split("/")[objectKey.split("/").length - 1];
      var dstKey = `${objectKey.substr(0, objectKey.lastIndexOf("/") + 1)}thumb/${image_file_name_w_ext}.jpg`;
      // var video_file_name = objectKey.split('.').slice(0, -1).join('.') + "." + fileType[0].substr(1);
      console.log("Path to store : ", path_to_store_image);
      console.log("Image File name with extension : ", image_file_name_w_ext);
      console.log("Thumb path : ", dstKey);
      console.log("File Type : ", fileType);
      console.log("Video file name : ", video_file_name);
      var allowedFileTypes = ["mov", "mp4", "wmv", "flv", "3gp", "wmv", "avi"];

      if (fileType === null) {
        // console.log("Invalid filetype found for key: " + objectKey);
        return callback("Invalid file type");;
      }

      fileType = fileType[0].substr(1);

      if (allowedFileTypes.indexOf(fileType) === -1) {
        // console.log("Filetype " + fileType + " not valid for thumbnail, exiting");
        return callback("file type not valid for thumbnail");
      }
      try {
        fs.writeFile('/tmp/' + video_file_name, data.Body, function (err) {
          if (err)
            console.log(err.code, "-", err.message);

          require('child_process').exec(
            'cp /var/task/ffmpeg /tmp/.; chmod 755 /tmp/ffmpeg;',
            function (error, stdout, stderr) {
              if (error) {
                console.log('ffmpeg permissions couldnt be set');
                console.log(error);
                console.log(stdout);
                console.log(stderr);
                return callback(error);
              } else {

                var process = new ffmpeg('/tmp/' + video_file_name);//'https://s3.amazonaws.com/videothumbtest/2016-06-14-09-06-42-AM.mp4');

                process.then(function (video) {
                  // console.log("Video : ", video);
                  video.fnExtractFrameToJPG(path_to_store_image, {
                    frame_rate: 1,
                    number: 1,
                    file_name: image_file_name_w_ext,
                    keep_pixel_aspect_ratio: true,
                    keep_aspect_ratio: true
                  }, function (error, files) {
                    if (error) {
                      console.log("Error while getting video thumbnail : ", error);
                      return callback(error);
                    }
                    else {
                      console.log('Frames: ' + files);
                      //  console.log('my_frame_%t_%s');

                      var content = new Buffer(fs.readFileSync(`${path_to_store_image}/${image_file_name_w_ext}_1.jpg`));//${files[0]}

                      console.log("Destination Bucket :", destinationBucket);
                      console.log("Destination key :", dstKey);
                      console.log("Content :", content);

                      var uploadParams = { Bucket: destinationBucket, Key: dstKey, Body: content, ContentType: 'image/jpg', StorageClass: "STANDARD", ACL: 'public-read' };
                      s3.upload(uploadParams, function (err, data) {
                        if (err) {
                          console.log(err, err.stack);
                        } else {
                          console.log("Video Thumbnail upload result : ", data);
                          fs.unlink('/tmp/' + video_file_name, function (err) {
                            console.log('temp file deleted!');
                            return callback();
                          });
                        }
                      });
                    }
                  });
                }, function (err) {
                  console.log('Error while processing video : ' + err);
                  context.done();
                });
              }
            });
        });
      } catch (e) {
        console.log("Coming in catch :", e.code);
        console.log("Coming in catch :", e.msg);
      }
    }
  });
}

function generateImageThumnail(event, context) {

  var MAX_WIDTH = 300, MAX_HEIGHT = 300;

  // get reference to S3 client 
  var s3 = new AWS.S3();

  // Read options from the event.
  console.log("Reading options from event:\n", util.inspect(event, { depth: 5 }));
  var srcBucket = event.Records[0].s3.bucket.name;
  var srcKey = event.Records[0].s3.object.key;
  var dstBucket = srcBucket;
  var img_path = srcKey.split("/");

  //if (img_path.length > 3) {
  //  var dstKey = img_path[0] + "/" + img_path[1] + "/" + img_path[2] + "/thumb/" + img_path[3];
  //} else if (img_path.length > 2) {
  var dstKey = img_path[0] + "/" + img_path[1] + "/thumb/" + img_path[2];
  //} else {
  //  var dstKey = img_path[0] + "/thumb/" + img_path[1]
  //}



  // Sanity check: validate that source and destination are different buckets.
  //if (srcBucket == dstBucket) {
  //  console.error("Destination bucket must not match source bucket.");
  //return;
  //}

  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    console.error('unable to infer image type for key ' + srcKey);
    return;
  }

  var validImageTypes = ['png', 'jpg', 'jpeg', 'gif'];
  var imageType = typeMatch[1];
  if (validImageTypes.indexOf(imageType.toLowerCase()) < 0) {
    console.log('skipping non-image ' + srcKey);
    return;
  }

  // Download the image from S3, transform, and upload to a different S3 bucket.
  async.waterfall([
    function download(next) {
      // Download the image from S3 into a buffer.
      s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
      }, next);
    },
    function tranform(response, next) {
      gm(response.Body).size(function (err, size) {
        // Infer the scaling factor to avoid stretching the image unnaturally.
        var scalingFactor = Math.min(
          MAX_WIDTH / size.width,
          MAX_HEIGHT / size.height
        );
        var width = scalingFactor * size.width;
        var height = scalingFactor * size.height;

        // Transform the image buffer in memory.
        this.resize(width, height)
          .toBuffer(imageType, function (err, buffer) {
            if (err) {
              next(err);
            } else {
              next(null, response.ContentType, buffer);
            }
          });
      });
    },
    function upload(contentType, data, next) {
      // Stream the transformed image to a different S3 bucket.
      s3.putObject({
        Bucket: dstBucket,
        Key: dstKey,
        ACL: 'public-read',
        Body: data,
        ContentType: contentType
      }, next);
    }],
    function (err) {
      if (err) {
        console.error(
          'Unable to resize ' + srcBucket + '/' + srcKey +
          ' and upload to ' + dstBucket + '/' + dstKey +
          ' due to an error: ' + err
        );
        context.done();
      } else {
        console.log(
          'Successfully resized ' + srcBucket + '/' + srcKey +
          ' and uploaded to ' + dstBucket + '/' + dstKey
        );

        // hash-fileId.ext
        var fileMatch = srcKey.match(/\-([^.]*)\./);

        if (!fileMatch) {
          context.done();
        } else {
          var fileId = fileMatch[1];

          var bucketConfig = config.buckets[srcBucket];
          request.post(bucketConfig.host + '/api/files/' + fileId + '/thumbnail', {
            form: {
              bucket: bucketConfig.bucket,
              secret: bucketConfig.secret
            }
          }, function (err, response, body) {
            err && console.log('could not make request back: ' + err);
            context.done();
          });
        }
      }
    }
  );
}